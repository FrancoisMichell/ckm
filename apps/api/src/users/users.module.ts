import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordService } from '@/common/utils/password.service';
import { User } from './entities/user.entity';
import { UserRole } from './entities/user-role.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserRole])],
  providers: [UsersService, PasswordService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
