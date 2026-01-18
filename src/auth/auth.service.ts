import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import { User } from '../entities/user.entity';
import { Wallet } from '../entities/wallet.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet) private readonly walletRepo: Repository<Wallet>,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string) {
    const e = (email ?? '').trim().toLowerCase();
    if (!e) throw new BadRequestException('Email is required');
    if (!password || password.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const exists = await this.userRepo.findOne({ where: { email: e } });
    if (exists) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(password, 10);

   
    const user = this.userRepo.create({
      email: e,
      passwordHash,
      createdAt: new Date(),
    });

    const saved = await this.userRepo.save(user);

    // tworzymy wallet od razu po rejestracji
    const wallet = this.walletRepo.create({
      userId: saved.id,
      balancePLN: '0.00',
    } as any);
    await this.walletRepo.save(wallet);

    return { ok: true, userId: saved.id };
  }

  async login(email: string, password: string) {
    const e = (email ?? '').trim().toLowerCase();

    const user = await this.userRepo.findOne({ where: { email: e } });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email };
    const access_token = await this.jwtService.signAsync(payload);

    return { access_token };
  }
}
