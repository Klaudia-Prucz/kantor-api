import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      // lepiej wywalić od razu niż generować tokeny, których nie da się zweryfikować
      throw new Error("JWT_SECRET is not set. Add it to your .env file.");
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: any) {
    // payload.sub ustawiasz w AuthService: { sub: user.id, email: user.email }
    return { userId: payload.sub, email: payload.email };
  }
}
