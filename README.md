
# Kantor API

**Kantor API** to backendowa aplikacja do obsługi wirtualnego kantoru walutowego. Pozwala na rejestrację użytkowników, wpłaty PLN, wymianę walut, podgląd transakcji i sald portfela.

## Technologie

- NestJS (Node.js, TypeScript)
- TypeORM (PostgreSQL)
- JWT (autoryzacja)
- decimal.js (precyzyjna arytmetyka walutowa)

## Jak uruchomić lokalnie?

1. Sklonuj repozytorium:
   ```bash
   git clone https://github.com/Klaudia-Prucz/kantor-api.git
   cd kantor-api
   ```
2. Zainstaluj zależności:
   ```bash
   npm install
   ```
3. Skonfiguruj połączenie z bazą PostgreSQL w pliku `.env` lub `src/app.module.ts` (domyślnie: `localhost`, baza: `kantor`, użytkownik: `postgres`, hasło: `postgres`).
4. Uruchom aplikację:
   ```bash
   npm run start:dev
   ```
5. API będzie dostępne domyślnie pod `http://localhost:3000`

## Podstawowe endpointy

- `POST /auth/register` — rejestracja użytkownika
- `POST /auth/login` — logowanie (JWT)
- `GET /wallet/me` — saldo portfela
- `POST /wallet/deposit` — wpłata PLN
- `POST /exchange/buy` — kupno waluty
- `POST /exchange/sell` — sprzedaż waluty
- `GET /transactions/me` — lista transakcji użytkownika

## Testy

Uruchom testy jednostkowe i e2e:
```bash
npm run test
npm run test:e2e
```

---

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```


