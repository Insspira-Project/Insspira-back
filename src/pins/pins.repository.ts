// src/pins/pins.repository.ts
import { Pin } from "./entities/pins.entity";
import {  In, Repository } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { pinsDto, updateDto } from "./pinsDtos/pins.dto";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Like } from "./entities/likes.entity";
import { Comment } from "./entities/comments.entity";
import { CommentDto } from "./pinsDtos/comments.dto";
import { User } from "src/users/entities/user.entity";
import { Hashtag } from "./entities/hashtag.entity";
import { Category } from "../categories/category.entity";
import { View } from "./entities/view.entity";
import { Save } from "./entities/save.entity";
import { NotificationsService } from "src/notifications/notifications.service";



export class PinsRepository {
    
    
    
    constructor(
        @InjectRepository(Category)
        private readonly categoryRepo: Repository<Category>,

        @InjectRepository(Pin)
        private readonly pinsRepo: Repository<Pin>,

        @InjectRepository(Like)
        private readonly likeRepo: Repository<Like>,

        @InjectRepository(Comment)
        private readonly commentRepo: Repository<Comment>,

        @InjectRepository(User)
        private readonly userRepo: Repository<User>,

        @InjectRepository(Hashtag)
        private readonly hashtagRepo: Repository<Hashtag>,

        @InjectRepository(View)
        private readonly viewRepo: Repository<View>,

        @InjectRepository(Save)
        private readonly saveRepo: Repository<Save>,

        private readonly notificationsService: NotificationsService
    ){}

    // Create Query PINS Repository
    
    async createSearch(query: string) {
        
        return this.pinsRepo
        .createQueryBuilder("p")
        .leftJoinAndSelect("p.hashtags", "h")
        .where("p.description ILIKE :q", {q: `%${query}%`})
        .orWhere("h.tag ILIKE :q", { q: `%${query}%` })
        .getMany()
    }

    // Create PINS Repository

    async getPins(page: number, limit: number, userId?: string): Promise<any[]> {
      const query = this.pinsRepo
        .createQueryBuilder('pin')
        .leftJoinAndSelect('pin.hashtags', 'hashtags')
        .leftJoinAndSelect('pin.user', 'user')
        .orderBy('pin.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);
    
      const pins = await query.getMany();
    
      // ✅ Si hay userId, verificar qué pins tienen like del usuario
      if (userId) {
        console.log('🔍 Buscando likes del usuario:', userId.substring(0, 8) + '...');
        
        const pinIds = pins.map(p => p.id);
        
        if (pinIds.length === 0) {
          return [];
        }
    
        const userLikes = await this.likeRepo.find({
          where: {
            user: { id: userId },
            pin: { id: In(pinIds) }
          },
          relations: ['pin']
        });
    
        console.log('❤️ Likes encontrados:', userLikes.length);
        
        const likedPinIds = new Set(userLikes.map(like => like.pin.id));
    
        return pins.map(pin => ({
          id: pin.id,
          image: pin.image,
          description: pin.description,
          likesCount: pin.likesCount,
          commentsCount: pin.commentsCount,
          viewsCount: pin.viewsCount,
          createdAt: pin.createdAt,
          liked: likedPinIds.has(pin.id), // ✅ Indica si el usuario dio like
          user: pin.user.username,
          hashtag: pin.hashtags,
          views: pin.viewsCount
        }));
      }
    
      // ✅ Sin usuario autenticado, todos los likes son false
      return pins.map(pin => ({
        id: pin.id,
        image: pin.image,
        description: pin.description,
        likesCount: pin.likesCount,
        commentsCount: pin.commentsCount,
        viewsCount: pin.viewsCount,
        createdAt: pin.createdAt,
        liked: false, // ✅ Usuario no autenticado = no likes
        user: pin.user.username,
        hashtag: pin.hashtags,
        views: pin.viewsCount
      }));
    }
 

    async pinsId(id: string) {
        const pin = await this.pinsRepo.findOne({
          where: { id: id },
          relations: ['user', 'hashtags', 'comments', 'comments.user', 'likes'] // ← Agregar comments.user
        });
        
        if (!pin) throw new NotFoundException("Pin not found");
      
        return {
          id: pin.id,                
          name: pin.user.username,
          userId: pin.user.id,       
          image: pin.image,
          description: pin.description,
          likes: pin.likesCount,
          comment: pin.commentsCount,
          views: pin.viewsCount,
          // ✅ Mapear comentarios con usuario
          comments: pin.comments.map(comment => ({
            id: comment.id,
            text: comment.text,
            createdAt: comment.createdAt,
            user: {
              id: comment.user.id,
              name: comment.user.name || comment.user.username || 'Anonymous',
              username: comment.user.username,
              avatar: comment.user.profilePicture
            }
          })),
          hashtag: pin.hashtags,
          created: pin.createdAt
        };
      }


    async createPins(dtoPin: pinsDto, idUser: string) {
        const category = await this.categoryRepo.findOne({ where: { id: dtoPin.categoryId } });
        if (!category) throw new NotFoundException("Category not found.");
    
        const user = await this.userRepo.findOne({ where: { id: idUser } });
        if (!user) throw new NotFoundException("User not found.");
    
        // ✅ Procesar hashtags si existen
        const hashtags: Hashtag[] = [];
        if (dtoPin.hashtags && dtoPin.hashtags.length > 0) {
            for (const tagString of dtoPin.hashtags) {
            // Limpiar el tag (quitar # si lo tiene)
            const cleanTag = tagString.trim().replace(/^#/, '');
            
            if (!cleanTag) continue; // Saltar tags vacíos
    
            // Buscar o crear el hashtag
            let hashtag = await this.hashtagRepo.findOne({ where: { tag: cleanTag } });
            if (!hashtag) {
                hashtag = this.hashtagRepo.create({ tag: cleanTag });
                await this.hashtagRepo.save(hashtag);
            }
            hashtags.push(hashtag);
            }
        }
    
        // Crear el pin
        const pin = this.pinsRepo.create({
            image: dtoPin.image,
            description: dtoPin.description,
            category,
            user,
            hashtags, // ✅ Agregar hashtags
        });
    
        await this.userRepo.increment({ id: user.id }, "pinsCount", 1);
        await this.pinsRepo.save(pin);

        return {
            id: pin.id,
            category: { id: category.id, name: category.name },
            user: {
                id: user.id,
                post: user.pinsCount + 1
            },
            image: pin.image,   
            description: pin.description,
            like: pin.likesCount,
            comment: pin.commentsCount,
            view: pin.viewsCount,
            hashtag: pin.hashtags, // ✅ Retornar hashtags
            date: pin.createdAt
        };
    }


    async modifiPins(userId: string, dtoPin: updateDto, pinsId: string, hashtags: { id: string; tag: string }[]) {
        
        const user = await this.userRepo.findOne({where: {id: userId}})
        if(!user) throw new NotFoundException("User not found.")

        const pin = await this.pinsRepo.findOne({where: {id: pinsId}, relations: ["hashtags"]})
        if(!pin) throw new NotFoundException("Post not found.")

        const updatedHashtags: Hashtag[] = []
            for (const h of hashtags) {
            const hashtag = await this.hashtagRepo.findOne({ where: { id: h.id } })
            if (!hashtag) throw new NotFoundException(`Hashtag with id not found.`)

                hashtag.tag = h.tag
            updatedHashtags.push(await this.hashtagRepo.save(hashtag))
            }

        const modifi =  this.pinsRepo.merge(
            pin, {    
                ...dtoPin,
                hashtags: updatedHashtags
            })

        return await this.pinsRepo.save(modifi)
    }

    async deletePins(id: string, userId: string): Promise<Pin> {
        
        const user = await this.userRepo.findOne({where: {id: userId}})
        if(!user) throw new NotFoundException("User not found.")


        const pin = await this.pinsRepo.findOne({where: {id: id}, relations: ["user"]})
        if(!pin) throw new NotFoundException("Error to delete the post.")

        
        if(pin.user.id !== user.id) throw new ForbiddenException("You are not allowed to delete this post.")

        await this.userRepo.decrement({id: user.id}, "pinsCount", 1)

        return await this.pinsRepo.remove(pin)   
    }

    // Create Like PINS Repository
    

    async createLike(idPin: string, idUser: string) {
      const pin = await this.pinsRepo.findOne({ 
        where: { id: idPin }, 
        relations: ['user']
      });
      
      if (!pin) throw new NotFoundException('Pin not found');
      
      const user = await this.userRepo.findOne({ where: { id: idUser } });
      if (!user) throw new NotFoundException("User not found.");
    
      // ✅ CRÍTICO: Buscar like existente
      const existingLike = await this.likeRepo.findOne({
        where: { 
          pin: { id: pin.id }, 
          user: { id: user.id }
        }
      });
    
      if (existingLike) {
        // Unlike
        console.log('👎 Removing like from user:', user.id.substring(0, 8));
        await this.likeRepo.remove(existingLike);
        await this.pinsRepo.decrement({ id: pin.id }, 'likesCount', 1);
        return { liked: false, likesCount: Math.max(pin.likesCount - 1, 0) };
      }
    
      // Like
      console.log('👍 Adding like from user:', user.id.substring(0, 8));
      const newLike = this.likeRepo.create({ pin, user });
      await this.likeRepo.save(newLike);
      
      // ✅ Enviar notificación solo si NO es el propio usuario
      if (pin.user.id !== user.id) {
        await this.notificationsService.sendActivity({
          recipientEmail: pin.user.email,
          type: 'like',
          photoTitle: pin.description
        });
      }
      
      await this.pinsRepo.increment({ id: pin.id }, 'likesCount', 1);
      return { liked: true, likesCount: pin.likesCount + 1 };
    }

    async likeStatus(pinId: string, userId: string) {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException("User not found.");
      
      const pin = await this.pinsRepo.findOne({ 
        where: { id: pinId }
      });
      if (!pin) throw new NotFoundException('Pin not found');
      
      // ✅ Verificar si existe un like de este usuario para este pin
      const existingLike = await this.likeRepo.findOne({
        where: { 
          pin: { id: pin.id }, 
          user: { id: user.id } 
        }
      });
      
      console.log('🔍 likeStatus -', {
        pinId: pinId.substring(0, 8) + '...',
        userId: userId.substring(0, 8) + '...',
        liked: !!existingLike,
        likesCount: pin.likesCount
      });
      
      return { 
        liked: !!existingLike,
        likesCount: pin.likesCount
      };
    }


    // Create Comment PINS Repository
    async viewComment(pinId: string) {
        const pin = await this.pinsRepo.findOne({
          where: { id: pinId },
          relations: ['user', 'comments', 'comments.user'] // ← Agregar comments.user
        });
      
        if (!pin) return [];
      
        // ✅ Retornar comentarios con información del usuario
        return pin.comments.map(comment => ({
          id: comment.id,
          text: comment.text,
          createdAt: comment.createdAt,
          user: {
            id: comment.user.id,
            name: comment.user.name || comment.user.username || 'Anonymous',
            username: comment.user.username,
            avatar: comment.user.profilePicture
          }
        }));
      }

      async createComment(userId: string, pinId: string, comment: CommentDto) {
        const pin = await this.pinsRepo.findOne({
          where: { id: pinId },
          relations: ['user'],
        });
        
        if (!pin) throw new NotFoundException("Post not found.");
        
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException("User not found.");
        
        const commentCreate = this.commentRepo.create({
          pin,
          user,
          text: comment.text
        });
        
        await this.commentRepo.save(commentCreate);
        await this.pinsRepo.increment({ id: pin.id }, "commentsCount", 1);
      
        await this.notificationsService.sendActivity({
          recipientEmail: pin.user.email,
          type: 'comment',
          photoTitle: pin.description,
          comment: comment.text
        });
      
        // ✅ Retornar con información del usuario
        return {
          id: commentCreate.id,
          text: commentCreate.text,
          createdAt: commentCreate.createdAt,
          user: {
            id: user.id,
            name: user.name || user.username || 'Anonymous',
            username: user.username,
            avatar: user.profilePicture
          },
          pin: { id: commentCreate.pin.id }
        };
      }

    async modifieComment(id: string, comment: CommentDto, userId: string): Promise<Comment> {
        const user = await this.userRepo.findOne({where: {id: userId}})
        if(!user) throw new NotFoundException("User not found.")

        const commentId = await this.commentRepo.findOne({where: {id: id}, relations: ["user"]})
        if(!commentId) throw new NotFoundException("Comment not found.")
        if(commentId.user.id !== user.id) throw new ForbiddenException("You are not allowed to modifie this comment.")  

        const modifiComment = this.commentRepo.merge(commentId, comment)
        return await this.commentRepo.save(modifiComment)
    }

    async deleteComment(id: string, userId: string): Promise<Comment> {
        const user = await this.userRepo.findOne({where: {id: userId}})
        if(!user) throw new NotFoundException("User not found.")

        const commentId = await this.commentRepo.findOne({where: {id: id}, relations:["user", "pin"]}) 
        if(!commentId) throw new NotFoundException("Comment not found.")
        if(commentId.user.id !== user.id) throw new ForbiddenException("You are not allowed to delete this comment.")

        await this.pinsRepo.decrement({id: commentId.pin.id}, "commentsCount", 1)    
        return await this.commentRepo.remove(commentId)
    }

    // Create View PINS Repository
    async createView(idUser: string, idPins: string) {
        const pin = await this.pinsRepo.findOne({where: {id: idPins}})
        if(!pin) throw new NotFoundException("Post not found.")
        
        const user = await this.userRepo.findOne({where: {id: idUser}})
        if(!user) throw new NotFoundException("User not found.")

        const viewCreate = this.viewRepo.create({
            user: {id: user.id},
            pin: {id: pin.id}
        })
    
        await this.pinsRepo.increment({id: pin.id}, "viewsCount", 1)
        await this.viewRepo.save(viewCreate)

        return viewCreate;
    }

    // Create Save PINS Repository
    async createGetSave( idUser:string) {
        const user = await this.userRepo.findOne({ where: { id: idUser } });
        if (!user) throw new NotFoundException("User not found.");

        

        const save = await this.saveRepo.find({
            where: {user: {id: user.id}},
            relations: ["pin"]
        })

        const pins = save.map(e=> e.pin)

        return pins
    }

    async createSave(idPin: string, idUser: string ) {
        
        const pin = await this.pinsRepo.findOne({ where: { id: idPin } });
        if (!pin) throw new NotFoundException("Post not found.");

        const user = await this.userRepo.findOne({ where: { id: idUser } });
        if (!user) throw new NotFoundException("User not found.");


        const existing = await this.saveRepo.findOne({
        where: { user: { id: user.id }, pin: { id: pin.id } },
        });
        if (existing) throw new BadRequestException("This post is already saved.");


        const save = this.saveRepo.create({
            user: {id: user.id},
            pin,
        });

        return await this.saveRepo.save(save);
    }


    async createDeleteSave(id: string, idUser: string) {

        const user = await this.userRepo.findOne({ where: { id: idUser } });
        if (!user) throw new NotFoundException("User not found.");

        const deleteSave = await this.saveRepo.findOne({where: {id: id}, relations: ["user"]})
        if(!deleteSave) throw new NotFoundException("Item not found.")

        if(deleteSave.user.id !== user.id)throw new ForbiddenException("You are not allowed to delete this comment.")

        await this.saveRepo.remove(deleteSave)    
    }

    async getPinsByUser(userId: string, page: number = 1, limit: number = 20): Promise<Pin[]> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException("User not found.");
    
        // QueryBuilder para obtener pins del usuario con todas las relaciones
        const query = this.pinsRepo
            .createQueryBuilder('pin')
            .leftJoinAndSelect('pin.user', 'user')
            .leftJoinAndSelect('pin.category', 'category')
            .leftJoinAndSelect('pin.hashtags', 'hashtags')
            .leftJoin('pin.likes', 'likes')
            .leftJoin('pin.comments', 'comments')
            .where('pin.userId = :userId', { userId })
            .orderBy('pin.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
    
        const pins = await query.getMany();
        
        return pins;
    }
    
    // Obtener todos los pins que un usuario ha dado like
    async getLikedPins(userId: string, page: number = 1, limit: number = 20): Promise<Pin[]> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException("User not found.");
    
        // QueryBuilder completo para obtener likes con todas las relaciones del pin
        const query = this.pinsRepo
            .createQueryBuilder('pin')
            .leftJoinAndSelect('pin.user', 'user')
            .leftJoinAndSelect('pin.category', 'category')
            .leftJoinAndSelect('pin.hashtags', 'hashtags')
            .leftJoin('pin.likes', 'likes')
            .leftJoin('pin.comments', 'comments')
            .innerJoin('likes', 'userLikes', 'userLikes.pinId = pin.id AND userLikes.userId = :userId', { userId })
            .where('userLikes.userId = :userId', { userId })
            .orderBy('pin.createdAt', 'DESC')
            .skip((page - 1) * limit)
            .take(limit);
    
        const pins = await query.getMany();
        
        return pins;
    }

    async getUserPinsCount(userId: string): Promise<number> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException("User not found.");
        
        return user.pinsCount;
    }
}
