import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    private jwtService: JwtService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) throw new BadRequestException('Email already exists');

    const hash = await bcrypt.hash(password, 10);

    const user = this.userRepo.create({
      email,
      passwordHash: hash,
      createdAt: new Date(),
    });

    const savedUser = await this.userRepo.save(user);

    const wallet = this.walletRepo.create({
      userId: savedUser.id,
      balancePLN: '0',
    });

    await this.walletRepo.save(wallet);

    return { userId: savedUser.id };
  }

  async login(email: string, password: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const token = await this.jwtService.signAsync({ sub: user.id, email: user.email });

    return { token, userId: user.id };
  }
}
