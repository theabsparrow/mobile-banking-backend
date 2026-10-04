# 📱 Mobile Banking Backend — Project Documentation & API Reference

> **Generated on:** September 24, 2026  
> **Status:** Fully Functional & Documented  
> **Repository:** `mobile-banking-backend`

---

## 📑 Table of Contents

1. [Project Overview & Architecture](#-project-overview--architecture)
2. [Tech Stack & Dependencies](#-tech-stack--dependencies)
3. [Database Architecture & Data Models](#-database-architecture--data-models)
4. [Redis Architecture & Caching Strategy](#-redis-architecture--caching-strategy)
5. [Authentication & Security Flow](#-authentication--security-flow)
6. [Complete API Reference](#-complete-api-reference)
   - [1. Authentication Module (`/api/v1/auth`)](#1-authentication-module-apiv1auth)
   - [2. User Management Module (`/api/v1/users`)](#2-user-management-module-apiv1users)
   - [3. User Contacts Module (`/api/v1/contacts`)](#3-user-contacts-module-apiv1contacts)
   - [4. Transaction Module (`/api/v1/transactions`)](#4-transaction-module-apiv1transactions)
   - [5. Fund Request Module (`/api/v1/requests`)](#5-fund-request-module-apiv1requests)
7. [Real-time Events (Socket.IO)](#-real-time-events-socketio)
8. [Database Setup & How to Run the Server](#-database-setup--how-to-run-the-server)
9. [Important Notes & Recommendations](#-important-notes--recommendations)

---

## 🌟 Project Overview & Architecture

**Mobile Banking Backend** is an enterprise-grade mobile financial service (MFS) backend application. It is engineered with modular architecture, strict data consistency, double-entry ledger accounting, multi-device session management, multi-layered Redis caching and security, rate-limiting, and real-time Socket.IO notifications.

### High-Level Architecture

```
                    +---------------------------+
                    |    Client Applications    |
                    | (React, React Native/App) |
                    +-------------+-------------+
                                  |
                                  v  HTTP & WebSockets
               +--------------------------------------+
               |          Express.js 5 API            |
               | +----------------------------------+ |
               | | Middlewares:                     | |
               | | • Rate Limiter (Redis)           | |
               | | • Auth & RBAC (JWT + Cache)      | |
               | | • Multi-Device Session Guard     | |
               | | • OTP & PIN Setup Guards         | |
               | | • Zod Request Validator          | |
               | +----------------------------------+ |
               +--------+--------------------+--------+
                        |                    |
       Prisma ORM       |                    | In-Memory Cache & Lock
            v           v                    v
  +-----------------------+        +-------------------+
  | PostgreSQL (Primary)  |        |    Redis Cache    |
  | • Users & Profiles    |        | • Auth Cache      |
  | • Sessions & Devices  |        | • Rate Limits     |
  | • Wallets & Ledgers   |        | • OTP & Sessions  |
  | • Transactions        |        | • Contact Cache   |
  | • Requests & Alerts   |        +-------------------+
  +-----------------------+
            |
            | Audit & Extended Logging Connection
            v
  +-----------------------+
  |    MongoDB Mongoose   |
  +-----------------------+
```

---

## 🛠 Tech Stack & Dependencies

| Category | Technology | Description |
| :--- | :--- | :--- |
| **Language & Runtime** | Node.js (ES Modules), TypeScript (`tsx`) | Type-safe execution with zero-transpile dev runner |
| **Framework** | Express.js 5 (`^5.2.1`) | High-performance routing & middleware |
| **Relational Database** | PostgreSQL 16 | ACID-compliant primary storage for banking data |
| **ORM** | Prisma 6 (`^6.19.3`) | Modular schema files and type-safe database queries |
| **NoSQL Database** | MongoDB & Mongoose (`^9.7.4`) | Dual-database connection setup for future logging/auditing |
| **In-Memory Store** | Redis (`^6.2.0`) | Sliding window rate limiting, OTP flow, sessions, cache |
| **Real-time Server** | Socket.IO (`^4.8.3`) | Live balance updates & push notification events |
| **Authentication** | JWT (`jsonwebtoken ^9.0.3`) | Stateless tokens paired with stateful DB sessions |
| **Cryptography** | `bcryptjs` | Password, PIN, and refresh token hashing |
| **Validation** | Zod (`^4.4.3`) | Strict schema validation for incoming requests |
| **Device Identification**| `ua-parser-js` | OS, Browser, and Device Model parsing |
| **Email Service** | Nodemailer (`^9.0.3`) | Automated transactional emails with HTML templates |

---

## 🗄 Database Architecture & Data Models

Prisma schemas are organized modularly in `prisma/schema/`:

### 1. `User` Model (`user.prisma`)
Stores core credentials, role, status, security flags, and wallet link.
- **Fields:**
  - `id`: UUID (Primary Key)
  - `email`: String (Unique)
  - `phone`: String (Unique, Optional)
  - `password`: Hashed string
  - `pin`: Hashed 6-digit transaction PIN
  - `role`: Enum (`SUPER_ADMIN`, `ADMIN`, `AGENT`, `CUSTOMER`) — Default: `CUSTOMER`
  - `isVerified`: Boolean (Email verification flag)
  - `isPinSet`: Boolean (Transaction PIN setup flag)
  - `status`: Enum (`ACTIVE`, `BLOCKED`, `SUSPENDED`) — Default: `ACTIVE`
  - `isDefaultPassword`: Boolean (Flags admin-generated temporary passwords)
  - `defaultPasswordExpiry`: DateTime (Expiry time for default passwords)
  - `createdById`: UUID (Reference to Admin/Agent who registered this user)
  - `maxDeviceAllowed`: Integer (Default: 1)
  - `balance`: Float (Cached balance on user model)
  - `createdAt`, `updatedAt`: Timestamps

### 2. `Profile` Model (`profile.prisma`)
One-to-One with `User`.
- **Fields:** `id`, `name`, `address`, `image`, `userId` (Unique Foreign Key).

### 3. `Session` Model (`session.prisma`)
Manages device-level login sessions and token revocation.
- **Fields:**
  - `id`: UUID (matches `sessionId` inside JWT payload)
  - `refreshTokenHash`: Hashed refresh token (Unique)
  - `status`: Enum (`ACTIVE`, `REVOKED`)
  - `deviceName`, `browser`, `operatingSystem`, `ipAddress`, `userAgent`
  - `lastActivity`, `expiresAt`, `revokedAt`
  - `userId`: Foreign key referencing `User`

### 4. `Wallet` Model (`wallet.prisma`)
One-to-One with `User`. Holds precise monetary balances.
- **Fields:**
  - `id`: UUID
  - `userId`: UUID (Unique Foreign Key)
  - `balance`: Decimal (Precision: 18, Scale: 2)
  - `currency`: String (Default: `"BDT"`)
  - `status`: Enum (`ACTIVE`, `FROZEN`, `BLOCKED`)

### 5. `Transaction` Model (`transaction.prisma`)
Represents financial transfers between wallets or via agents.
- **Fields:**
  - `id`: UUID
  - `reference`: String (Unique, e.g. `TXN-SM-17271424...`)
  - `type`: Enum (`SEND_MONEY`, `CASH_IN`, `CASH_OUT`, `REFUND`)
  - `status`: Enum (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `REVERSED`, `CANCELLED`)
  - `amount`, `fee`, `totalAmount`: Decimal (18, 2)
  - `senderWalletId`, `receiverWalletId`: Foreign keys referencing `Wallet`
  - `initiatedById`: Foreign key referencing `User`
  - `description`: Text description

### 6. `WalletLedger` Model (`walletLeadger.prisma`)
**Double-entry accounting ledger**. Every completed transaction creates two immutable ledger records (one DEBIT, one CREDIT).
- **Fields:**
  - `id`: UUID
  - `walletId`: Foreign key to `Wallet`
  - `transactionId`: Foreign key to `Transaction`
  - `type`: Enum (`DEBIT`, `CREDIT`)
  - `amount`: Decimal (18, 2)
  - `balanceBefore`: Decimal (18, 2)
  - `balanceAfter`: Decimal (18, 2)
  - `createdAt`: Timestamp

### 7. `Request` Model (`request.prisma`)
Money request mechanism (Business Cash-In Request or Peer-to-Peer Request).
- **Fields:**
  - `id`: UUID
  - `requesterId`: User who requested funds
  - `receiverId`: User/Admin receiving the request
  - `amount`: Decimal (18, 2)
  - `reason`: Purpose
  - `status`: Enum (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`)
  - `processedById`: Admin/User who approved/rejected
  - `adminNote`, `rejectionReason`, `transactionId`
  - `processedAt`: Timestamp

### 8. `UserContact` Model (`userContact.prisma`)
Address book allowing users to save recipient users with custom names.
- **Fields:** `id`, `ownerId`, `savedUserId`, `customName`, `createdAt`, `updatedAt` (Unique on `[ownerId, savedUserId]`).

### 9. `Notification` Model (`notification.prisma`)
System alerts and transactional records.
- **Fields:** `id`, `userId`, `type` (`FUND_REQUEST_CREATED`, `TRANSACTION_SUCCESS`, `CASH_IN`, `CASH_OUT`, `SEND_MONEY`, etc.), `title`, `message`, `referenceId`, `isRead`.

---

## ⚡ Redis Architecture & Caching Strategy

Redis is connected on startup via `src/redis/redis.client.ts`. It powers critical security, performance, and transactional safety features:

### 1. Sliding Window Rate Limiting (`src/middlewire/rateLimiter.ts`)
- **Key Pattern:** `{keyPrefix}{identifier}`
- **TTL:** Configurable (typically 1 min to 15 mins)
- **Mechanism:** Uses Redis `INCR`. If count is 1, sets TTL via `EXPIRE`. If count exceeds limit, immediately responds with HTTP 429 (`Too Many Requests`).
- **Examples:**
  - `register:{ip}`: Max 5 requests / 15 mins
  - `login-user:{ip}:{email/phone}`: Max 10 attempts / 5 mins
  - `rl:tx:send-money:{userId}`: Max 15 transactions / 1 min
  - `rl:tx:cash-in:{userId}`: Max 20 cash-in / 1 min
  - `rl:contacts:create:{userId}`: Max 10 contacts / 1 min

### 2. OTP Flow & Abuse Prevention (`src/utills/sendOtpFlow.ts`, `src/middlewire/otpRequestMiddlewire.ts`)
- **`verification:session:{verificationId}`**
  - Data: `{ userId, purpose }`
  - TTL: 24 Hours (`86400s`)
  - Purpose: Tracks active verification flow across multi-step registration or password resets.
- **`otp:verification:{verificationId}`**
  - Data: `{ userId, otpHash, purpose }`
  - TTL: 5 Minutes (`300s`)
  - Purpose: Holds the hashed OTP so plain OTP is never stored in memory or databases.
- **`otp:request:{userId}:{purpose}`**
  - TTL: 24 Hours
  - Purpose: Tracks total OTP requests per user per purpose. Capped at **5 requests in 24 hours**.
- **`otp:cooldown:{userId}:{purpose}`**
  - TTL: 5 Minutes
  - Purpose: Prevents spamming new OTP requests while a valid code exists.
- **`otp:attempt:{verificationId}`**
  - TTL: 24 Hours
  - Purpose: Tracks consecutive failed OTP entries. Capped at **5 wrong attempts**.
- **`otp:block:{userId}`**
  - TTL: 24 Hours
  - Purpose: Blocks the account from requesting or verifying OTPs if the 5-attempt limit is reached.

### 3. Step-Up Token Sessions
- **`pin:setup:{pinSetupId}`** (`src/utills/setPinSession.ts`, `src/middlewire/pinSetup.ts`)
  - Data: `{ userId }`
  - TTL: 10 Minutes (`600s`)
  - Purpose: Ensures only users who just verified their email can call `/set-pin`.
- **`password:reset:{passwordResetId}`** (`src/utills/setPinSession.ts`, `src/middlewire/passwordResetMiddlewire.ts`)
  - Data: `{ userId }`
  - TTL: 5 Minutes (`300s`)
  - Purpose: Grants one-time access to `/reset-password` without exposing user ID or password tokens in URLs.
- **`device-switch:{deviceSwitchId}`** (`src/module/auth/auth.utills.ts`, `src/middlewire/deviceSwitchMiddlewire.ts`)
  - Data: `userId`
  - TTL: 5 Minutes (`300s`)
  - Purpose: Issued during login when the user exceeds `maxDeviceAllowed`. Allows invoking `/logout-all` to clear old devices.

### 4. Auth User Caching (`src/middlewire/auth.ts`)
- **Key Pattern:** `auth:user:{userId}`
- **TTL:** 5 Minutes (`300s`)
- **Cached Data:** User status, verification flags, PIN setup flag, default password status.
- **Benefit:** Avoids querying the database on every authenticated request.
- **Invalidation:** Invalidated instantly via `invalidateAuthUserCache(userId)` when:
  - User updates profile, phone, or email
  - User sets or changes PIN
  - User changes or resets password
  - Balance changes via transactions or approved requests

### 5. User Contacts Caching (`src/module/userContact/userContact.service.ts`)
- **Key Pattern:** `contacts:user:{ownerId}:{search}`
- **TTL:** 1 Hour (`3600s`)
- **Invalidation:** All matching keys (`contacts:user:{ownerId}*`) are purged when a contact is added, modified, or deleted.

---

## 🔐 Authentication & Security Flow

### 1. Registration & Onboarding Lifecycle
```
[Client] ---> POST /auth/register
                 │
                 ├── 1. Validate email, phone, passwords (Zod)
                 ├── 2. Hash password (bcrypt)
                 ├── 3. Create User in PostgreSQL (isVerified=false, isPinSet=false)
                 ├── 4. Generate 6-digit OTP & store hash in Redis
                 ├── 5. Send OTP via Nodemailer
                 └── 6. Return verificationId
[Client] ---> POST /auth/verify-otp (with verificationId + OTP)
                 │
                 ├── 1. Validate OTP from Redis
                 ├── 2. Set isVerified = true in DB
                 ├── 3. Invalidate Redis OTP keys
                 ├── 4. Issue temporary pinSetupId in Redis (TTL: 10m)
                 └── 5. Return pinSetupId
[Client] ---> POST /auth/set-pin (with pinSetupId + 6-digit PIN)
                 │
                 ├── 1. Validate pinSetupId from Redis
                 ├── 2. Hash PIN with bcrypt
                 ├── 3. Set isPinSet = true in DB
                 └── 4. Account is now ready for Login!
```

### 2. Multi-Device Login & Session Control
- When user logs in, user-agent details (Device, Browser, OS, IP) are parsed.
- Active sessions are counted in the PostgreSQL `sessions` table.
- If `activeSessions >= maxDeviceAllowed`:
  - Returns `deviceLimitExceeded: true` and a `deviceSwitchId`.
  - User can invoke `POST /auth/logout-all` (authenticated with their PIN) to revoke all existing sessions.
- If allowed:
  - Creates a new active `Session` in DB with hashed refresh token.
  - Returns `accessToken` (HTTP-only cookie, 1 min) and `refreshToken` (HTTP-only cookie, 7 days).

---

## 📡 Complete API Reference

Base URL: `/api/v1`

---

### 1. Authentication Module (`/api/v1/auth`)

#### `POST /auth/register`
- **Description:** Registers a new customer account, creates their profile, and emails an OTP code.
- **Access:** Public
- **Rate Limit:** 5 requests / 15 minutes per IP
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "phone": "01700000000",
    "password": "StrongPassword123@",
    "confirmPassword": "StrongPassword123@"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "User registered successfully. An OTP code has been sent to your email.",
    "data": "a98a0b06-1234-4567-89ab-cdef01234567" // verificationId
  }
  ```

#### `POST /auth/resend-otp`
- **Description:** Resends an OTP to email if the previous one expired and cooldown passed.
- **Access:** Public
- **Rate Limit:** 5 requests / 5 minutes per `verificationId`
- **Request Body:**
  ```json
  {
    "verificationId": "a98a0b06-1234-4567-89ab-cdef01234567"
  }
  ```

#### `POST /auth/verify-otp`
- **Description:** Verifies OTP code for registration, login, email change, or password reset.
- **Access:** Public
- **Rate Limit:** 10 requests / 5 minutes per `verificationId`
- **Request Body:**
  ```json
  {
    "verificationId": "a98a0b06-1234-4567-89ab-cdef01234567",
    "otp": "123456"
  }
  ```
- **Response:**
  - For Registration: returns `pinSetupId`
  - For Forgot Password: returns `passwordResetId`

#### `POST /auth/set-pin`
- **Description:** Sets a 6-digit transaction PIN for the newly registered and verified account.
- **Access:** Public (Requires valid `pinSetupId` from Redis)
- **Rate Limit:** 5 requests / 5 minutes
- **Request Body:**
  ```json
  {
    "pinSetupId": "uuid-token-from-verify-otp",
    "newPin": "123456",
    "confirmPin": "123456"
  }
  ```

#### `POST /auth/login`
- **Description:** Authenticates via email or phone + password. Checks device limits and default password expiry.
- **Access:** Public
- **Rate Limit:** 10 requests / 5 minutes per IP + credential
- **Request Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "StrongPassword123@"
  }
  ```
- **Response:** Sets HTTP-only `accessToken` & `refreshToken` cookies, or returns `{ deviceLimitExceeded: true, deviceSwitchId }` if device limit reached.

#### `POST /auth/logout-all`
- **Description:** Revokes all active sessions for a user using their PIN and `deviceSwitchId`.
- **Access:** Public (Guarded by `deviceSwitchMiddleware` in Redis)
- **Request Body:**
  ```json
  {
    "deviceSwitchId": "uuid-from-login-response",
    "pin": "123456"
  }
  ```

#### `POST /auth/logout`
- **Description:** Revokes the current session and clears authentication cookies.
- **Access:** Authenticated (Requires valid access token session)

#### `POST /auth/refresh-token`
- **Description:** Refreshes the JWT access token using the stored refresh token cookie.
- **Access:** Authenticated (Requires valid refresh token)

#### `POST /auth/forget-password`
- **Description:** Sends an OTP to the user's email to initiate password recovery.
- **Access:** Public
- **Request Body:**
  ```json
  {
    "email": "user@example.com"
  }
  ```

#### `POST /auth/reset-password`
- **Description:** Sets a new password using the `passwordResetId` obtained from OTP verification. Revokes all active sessions.
- **Access:** Public (Guarded by `passwordResetMiddleware` in Redis)
- **Request Body:**
  ```json
  {
    "passwordResetId": "uuid-from-verify-otp",
    "newPassword": "NewPassword123@",
    "confirmNewPassword": "NewPassword123@"
  }
  ```

#### `POST /auth/change-password`
- **Description:** Changes account password from within the app using old password and PIN.
- **Access:** Authenticated (`auth()`)
- **Request Body:**
  ```json
  {
    "pin": "123456",
    "oldPassword": "CurrentPassword123@",
    "newPassword": "BrandNewPassword123@",
    "confirmNewPassword": "BrandNewPassword123@"
  }
  ```

---

### 2. User Management Module (`/api/v1/users`)

#### `POST /users`
- **Description:** Admin or Agent creates an account for a user. Can provide custom password or automatic default password with expiration hours.
- **Access:** `SUPER_ADMIN`, `ADMIN`, `AGENT`
- **Request Body:**
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "01800000000",
    "password": "OptionalPassword123@"
  }
  ```

#### `GET /users`
- **Description:** Lists all users with pagination, sorting, filtering by role/status, and name/email/phone search via `QueryBuilder`.
- **Access:** `SUPER_ADMIN`, `ADMIN`
- **Query Params:** `?page=1&limit=10&search=john&role=CUSTOMER&status=ACTIVE&sortBy=createdAt&sortOrder=desc`

#### `GET /users/get-me`
- **Description:** Returns the logged-in user's profile details and list of active sessions with device info.
- **Access:** Authenticated (`auth()`)

#### `GET /users/:id`
- **Description:** Returns full user profile, role, status, creator, and active sessions for a specific user ID.
- **Access:** Authenticated (`auth()`)

#### `PATCH /users/update-me`
- **Description:** Updates the authenticated user's name, address, avatar, phone, or email. If email changes, marks `isVerified: false` and issues an OTP verification flow.
- **Access:** Authenticated (`auth()`)
- **Request Body:**
  ```json
  {
    "name": "Updated Name",
    "address": "Dhaka, Bangladesh",
    "image": "https://example.com/avatar.jpg",
    "phone": "01711111111"
  }
  ```

#### `GET /users/search-users`
- **Description:** Search directory for Customers and Agents by name, email, or phone.
- **Access:** Authenticated (`auth()`)
- **Query Params:** `?search=rahim` or `?email=rahim@...` or `?phone=017...`

#### `GET /users/check-users`
- **Description:** Validates whether a customer or agent exists, is active, and is verified before sending money or cashing in.
- **Access:** Authenticated (`auth()`)

---

### 3. User Contacts Module (`/api/v1/contacts`)

#### `POST /contacts`
- **Description:** Saves another user to the authenticated user's contact book with an optional custom nickname. Purges user's contacts cache in Redis.
- **Access:** Authenticated (`auth()`)
- **Request Body:**
  ```json
  {
    "savedUserId": "uuid-of-target-user",
    "customName": "Brother"
  }
  ```

#### `GET /contacts`
- **Description:** Returns saved contacts for the user. Results are cached in Redis (`contacts:user:{ownerId}:{search}`) for 1 hour.
- **Access:** Authenticated (`auth()`)
- **Query Params:** `?search=keyword`

#### `GET /contacts/:id`
- **Description:** Gets details of a specific saved contact. Ensures the contact belongs to the authenticated user.
- **Access:** Authenticated (`auth()`)

#### `PATCH /contacts/:id`
- **Description:** Updates custom name or saved user in the contact. Invalidate Redis cache.
- **Access:** Authenticated (`auth()`)

#### `DELETE /contacts/:id`
- **Description:** Removes a contact from the address book. Invalidate Redis cache.
- **Access:** Authenticated (`auth()`)

---

### 4. Transaction Module (`/api/v1/transactions`)

All transactions are executed atomically using Prisma transactions (`prisma.$transaction`) with double-entry ledgers and instant balance synchronization.

#### `POST /transactions/send-money`
- **Description:** Customer transfers money to another Customer.
- **Access:** `CUSTOMER`
- **Rate Limit:** 15 requests / 1 minute
- **Flow:**
  1. Validates sender's 6-digit transaction PIN.
  2. Finds active recipient Customer by email or phone.
  3. Checks sufficient balance in sender wallet.
  4. Decrements sender wallet & user balance.
  5. Increments receiver wallet & user balance.
  6. Creates `Transaction` record (`type: 'SEND_MONEY'`, `status: 'COMPLETED'`).
  7. Creates two `WalletLedger` entries (`DEBIT` for sender, `CREDIT` for receiver).
  8. Purges Redis user cache for both users.
  9. Emits Socket.IO `balance-updated` and `notification` events to recipient in real time.
- **Fee Calculation:** Extra cost calculated per thousand (`BDT 5 per 1,000 BDT`).
- **Request Body:**
  ```json
  {
    "receiverPhoneOrEmail": "01811111111",
    "amount": 1000,
    "pin": "123456"
  }
  ```

#### `POST /transactions/cash-in`
- **Description:** Unified Cash In endpoint.
  - If initiated by `AGENT`: Deposits money into a Customer's account and earns agent commission (`BDT 4.14 per 1,000 BDT`) recorded in the Commission table.
  - If initiated by `ADMIN` / `SUPER_ADMIN`: Allocates float money directly to an Agent.
- **Access:** `AGENT`, `ADMIN`, `SUPER_ADMIN`
- **Rate Limit:** 20 requests / 1 minute
- **Request Body:**
  ```json
  {
    "receiverPhoneOrEmail": "customer@example.com",
    "amount": 1000,
    "pin": "123456",
    "description": "Business Cash In"
  }
  ```

#### `POST /transactions/admin-cash-in`
- **Description:** Dedicated float replenishment endpoint where Admin allocates balance to an Agent.
- **Access:** `ADMIN`, `SUPER_ADMIN`
- **Rate Limit:** 20 requests / 1 minute
- **Request Body:**
  ```json
  {
    "agentPhoneOrEmail": "agent@example.com",
    "amount": 50000,
    "pin": "123456",
    "description": "Float replenishment"
  }
  ```

#### `POST /transactions/cash-out`
- **Description:** Customer withdraws money through an Agent with fee per thousand (`BDT 15 per 1,000 BDT`).
- **Access:** `CUSTOMER`
- **Rate Limit:** 15 requests / 1 minute
- **Request Body:**
  ```json
  {
    "agentPhoneOrEmail": "agent@example.com",
    "amount": 1000,
    "pin": "123456"
  }
  ```

#### `GET /transactions` (Admin & Super Admin)
- **Description:** View all system transactions with extensive search and filtering.
- **Access:** `SUPER_ADMIN`, `ADMIN`
- **Rate Limit:** 60 requests / 1 minute
- **Query Parameters:**
  - `service` / `type`: Filter by transaction type (`SEND_MONEY`, `CASH_IN`, `CASH_OUT`, etc.)
  - `status`: Filter by transaction status (`COMPLETED`, `PENDING`, `FAILED`, etc.)
  - `date`: Filter for a specific single date (`YYYY-MM-DD`)
  - `startDate` & `endDate`: Filter by custom date range
  - `senderSearch`: Search sender by name, email, or phone
  - `receiverSearch`: Search receiver by name, email, or phone
  - `search`: Global search across sender/receiver name, email, phone, reference, or description
  - `page`, `limit`, `sortBy`, `sortOrder`: Pagination controls

#### `GET /transactions/my-transactions`
- **Description:** Logged-in Customer/Agent retrieves their personal transaction history. Excludes soft-deleted/hidden transactions for the calling user.
- **Access:** Authenticated (`auth()`)
- **Rate Limit:** 60 requests / 1 minute
- **Query Parameters:**
  - `service` / `type`: Filter by transaction type
  - `status`: Filter by status
  - `date`: Filter for a specific date (`YYYY-MM-DD`)
  - `startDate` & `endDate`: Filter by date range
  - `search`: Search counterparty (other party) by name, email, phone, or reference
  - `page`, `limit`, `sortBy`, `sortOrder`: Pagination controls
- **Response Features:** Includes `direction` (`"IN"` or `"OUT"`) and `counterparty` information.

#### `GET /transactions/commissions`
- **Description:** Agent retrieves their earned cash-in commissions and aggregated total income.
- **Access:** `AGENT`, `ADMIN`, `SUPER_ADMIN`
- **Rate Limit:** 60 requests / 1 minute
- **Query Parameters:** `date`, `startDate`, `endDate`, `search`, `page`, `limit`
- **Response:**
  ```json
  {
    "success": true,
    "message": "Agent commissions retrieved successfully.",
    "meta": { "page": 1, "limit": 10, "total": 25, "totalPage": 3 },
    "data": {
      "totalIncome": 103.50,
      "commissions": [ ... ]
    }
  }
  ```

#### `DELETE /transactions/:id`
- **Description:** Per-user soft deletion. Removes/hides the transaction from the calling user's view only (`transaction_hides`). The transaction remains visible to the other party and to Administrators.
- **Access:** Authenticated (`auth()`)
- **Rate Limit:** 30 requests / 1 minute

#### `GET /transactions/fee-config`
- **Description:** Retrieves the current dynamic transaction fee and commission configuration.
- **Access:** Authenticated (`auth()`)
- **Rate Limit:** 60 requests / 1 minute

#### `PATCH /transactions/fee-config`
- **Description:** Admin/Super Admin updates the system fee and commission rates from the dashboard. Changes take effect immediately system-wide.
- **Access:** `ADMIN`, `SUPER_ADMIN`
- **Rate Limit:** 20 requests / 1 minute
- **Request Body:**
  ```json
  {
    "sendMoneyFeePerThousand": 8.0,
    "cashOutFeePerThousand": 18.0,
    "cashInCommissionPerThousand": 6.0,
    "cashOutCommissionPerThousand": 0.0
  }
  ```

---

### 5. Wallet Module (`/api/v1/wallets`)

All wallet requests leverage Redis caching (`wallet:user:<userId>`) with a 1-hour TTL. Caches are immediately invalidated and synchronized across all money transfer operations (Send Money, Cash In, Cash Out, and Request Approval).

#### `GET /wallets/my-wallet` (or `/wallets/me`)
- **Description:** Retrieves the logged-in user's wallet with balance, currency, status, and profile details.
- **Access:** Authenticated (`auth()`)
- **Rate Limit:** 120 requests / 1 minute
- **Cache Strategy:** Checks Redis first; on miss, queries PostgreSQL, stores in Redis, and returns.

#### `GET /wallets/user/:id`
- **Description:** Admin views any user's wallet.
- **Access:** `ADMIN`, `SUPER_ADMIN`
- **Rate Limit:** 60 requests / 1 minute

---

### 5. Fund Request Module (`/api/v1/requests`)

#### `POST /requests/business`
- **Description:** Agent requests float/balance from Admin.
- **Access:** `AGENT`
- **Request Body:**
  ```json
  {
    "amount": 50000,
    "reason": "Branch float replenishment",
    "pin": "123456"
  }
  ```

#### `POST /requests/personal`
- **Description:** Customer requests money from another user.
- **Access:** Authenticated (`auth()`)
- **Request Body:**
  ```json
  {
    "receiverId": "uuid-of-target-user",
    "amount": 200,
    "reason": "Lunch bill split",
    "pin": "123456"
  }
  ```

#### `GET /requests`
- **Description:** Lists all requests for Admins, or filtered requests for standard users.
- **Access:** `ADMIN`, `SUPER_ADMIN`

#### `GET /requests/my-request`
- **Description:** Lists sent and received money requests for the logged-in user.
- **Access:** `CUSTOMER`, `AGENT`

#### `GET /requests/:id`
- **Description:** View single money request with status and processing notes.
- **Access:** Authenticated (`auth()`)

#### `PATCH /requests/:id/approve`
- **Description:** Approves a pending money request with PIN. Automatically executes the transaction transfer, deducts from approver, credits requester, creates ledger entries, and notifies requester via Socket.IO.
- **Access:** Authenticated (Must be the receiver or Admin)
- **Request Body:**
  ```json
  {
    "pin": "123456",
    "adminNote": "Approved float request"
  }
  ```

#### `PATCH /requests/:id/reject`
- **Description:** Rejects a pending request with PIN and a rejection note.
- **Access:** Authenticated (Must be the receiver)
- **Request Body:**
  ```json
  {
    "pin": "123456",
    "rejectionReason": "Unable to lend at this time"
  }
  ```

#### `PATCH /requests/:id/cancel`
- **Description:** Requester cancels their pending request with PIN.
- **Access:** Authenticated (Requester only)
- **Request Body:**
  ```json
  {
    "pin": "123456"
  }
  ```

#### `DELETE /requests/:id`
- **Description:** Deletes a money request record with PIN.
- **Access:** Authenticated (Requester only)

---

## ⚡ Real-time Events (Socket.IO)

Initialized in `src/socket/server.ts` and mounted onto the HTTP server in `src/server.ts`.

### Room Subscription:
- On connection, clients join a private room named by their `userId`:
  - Query parameter: `io('http://localhost:5000', { query: { userId: 'my-user-id' } })`
  - Or via socket event: `socket.emit('join', 'my-user-id')`

### Server-to-Client Events:
| Event Name | Payload | Emitted When |
| :--- | :--- | :--- |
| `balance-updated` | `{ balance: 1500.00 }` | Wallet balance updates from Send Money, Cash In, Cash Out, or Request Approval |
| `notification` | `{ message: "You received BDT 500 from Rahim." }` | Inbound financial transfer, cash-in, cash-out, or approval |
| `money-request-approved` | `Request` object | A money request submitted by the user is approved |

---

## 🚀 Database Setup & How to Run the Server

### 1. Requirements:
- **Node.js** (v18+)
- **pnpm** (v11+)
- **PostgreSQL 16** (running on port `5432`)
- **Redis** (running on port `6379`)

### 2. Environment Configuration (`.env`):
```env
NODE_ENV=development
PORT=5000
CLIENT_URL="https://mobile-banking.com"

# PostgreSQL URL
PRISMA_DATABASE_URL="postgresql://postgres:12345678@localhost:5432/mobile_banking?schema=public"

# MongoDB (Cluster URL)
MONGODB_DATABASE_URL="mongodb+srv://.../mobile-banking"

# Redis URL
REDIS_URL="redis://localhost:6379"

# JWT Config
JWT_ACCESS_TOKEN="<secret-key>"
JWT_REFRESHTOKEN="<secret-key>"
JWT_ACCESS_EXPIRE_IN=5m
JWT_REFRESH_EXPIRE_IN=10d

# Defaults
DEFAULT_USER_PASSWORD="User@123456"
DEFAULT_PASSWORD_VALIDITY_HOURS=24
```

### 3. Applying Database Migrations:
```bash
pnpm prisma migrate deploy
```

### 4. Running the Development Server:
```bash
pnpm dev
```
Console will display:
```
Connected to Redis successfully 🚀
server is running on port 5000 😎
```

---

## 📌 Important Notes & Recommendations

1. **User Router Ordering Note (`src/module/user/user.routes.ts`):**
   - Express evaluates routes in the order they are defined.
   - Currently, `router.get('/:id', ...)` is placed before `router.get('/get-me', ...)`, `router.get('/search-users', ...)`, and `router.get('/check-users', ...)`.
   - **Recommendation:** Move literal routes (`/get-me`, `/search-users`, `/check-users`) **above** parameterized route `/:id` so Express doesn't interpret strings like `'get-me'` as a user ID.
2. **Double-Entry Consistency:**
   - Both `Wallet.balance` (Decimal) and `User.balance` (Float) exist in the schema. When transactions execute, both are updated in sync inside Prisma interactive transactions.
3. **Auditability:**
   - Transactions never update existing transactions in place; every transfer creates immutable `WalletLedger` entries with before/after balances.
