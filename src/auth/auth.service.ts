import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import { Repository } from "typeorm";

import { User } from "../entities/user.entity";
import { Wallet } from "../entities/wallet.entity";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet) private readonly walletRepo: Repository<Wallet>,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, password: string, firstName: string, lastName: string) {
    const e = String(email ?? "").trim().toLowerCase();
    const fn = String(firstName ?? "").trim();
    const ln = String(lastName ?? "").trim();

    if (!e) throw new BadRequestException("Email is required");
    if (!password || password.length < 6) {
      throw new BadRequestException("Password must be at least 6 characters");
    }
    if (fn.length < 2) throw new BadRequestException("First name must be at least 2 characters");
    if (ln.length < 2) throw new BadRequestException("Last name must be at least 2 characters");

    const exists = await this.userRepo.findOne({ where: { email: e } });
    if (exists) throw new BadRequestException("Email already in use");

    const passwordHash = await bcrypt.hash(password, 10);

const user = this.userRepo.create({
  email: e,
  passwordHash,
  firstName: fn,
  lastName: ln,
  createdAt: new Date(),
});

    const saved = await this.userRepo.save(user);

   
    const wallet = this.walletRepo.create({
      userId: String(saved.id),
      balancePLN: "0.00",
    } as any);
    await this.walletRepo.save(wallet);

    return { ok: true, userId: saved.id };
  }

  async login(email: string, password: string) {
    const e = String(email ?? "").trim().toLowerCase();
    if (!e) throw new UnauthorizedException("Invalid credentials");
    if (!password) throw new UnauthorizedException("Invalid credentials");

    const user = await this.userRepo.findOne({ where: { email: e } });
    if (!user) throw new UnauthorizedException("Invalid credentials");

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");


    const payload = { sub: String(user.id), email: user.email };
    const access_token = await this.jwtService.signAsync(payload);

    return { access_token };
  }
}
