# AWS Database Setup Guide

This guide explains how to connect your Alphalabs Trading Platform to an AWS RDS PostgreSQL database for persistent data storage.

## Your AWS Configuration

| Property | Value |
|----------|-------|
| **Region** | `us-east-2` (Ohio) |
| **Resource Group** | `alphalabs` |
| **Application ARN** | `arn:aws:resource-groups:us-east-2:983890896641:group/alphalabs/06qt3h7r8x9cnlxx3pweisbhis` |
| **Tag Key** | `awsApplication` |

## Features Enabled by Database Connection

- **User Authentication Tracking**: Records login history for security and analytics
- **Backtest Configuration Saving**: Save and load your favorite configurations
- **Backtest Run History**: View all your past backtest results with performance metrics
- **Cross-Device Sync**: Access your data from any device

## Setup Instructions

### 1. Create an AWS RDS PostgreSQL Instance

1. Go to [AWS Console](https://console.aws.amazon.com/) → RDS (make sure you're in **us-east-2** region)
2. Click "Create database"
3. Choose "PostgreSQL" as the engine
4. Select your preferred tier:
   - **Free Tier**: `db.t3.micro` (good for development)
   - **Production**: `db.t3.small` or larger
5. Configure settings:
   - DB instance identifier: `alphalabs-db`
   - Master username: `postgres` (or your preferred username)
   - Master password: (save this securely!)
6. Under "Connectivity":
   - Make sure "Public access" is set to "Yes" if connecting from outside AWS
   - Create a new security group or use existing
7. **Add Tag** (to link to your resource group):
   - Key: `awsApplication`
   - Value: `arn:aws:resource-groups:us-east-2:983890896641:group/alphalabs/06qt3h7r8x9cnlxx3pweisbhis`
8. Click "Create database"

### 2. Configure Security Group

1. Go to EC2 → Security Groups
2. Find the security group attached to your RDS instance
3. Add an inbound rule:
   - Type: PostgreSQL
   - Port: 5432
   - Source: Your IP address or `0.0.0.0/0` (less secure, for development only)

### 3. Get Your Connection String

Your DATABASE_URL format:
```
postgresql://USERNAME:PASSWORD@ENDPOINT:5432/DATABASE_NAME
```

Example (for your us-east-2 region):
```
postgresql://postgres:MySecurePassword123@alphalabs-db.abc123xyz.us-east-2.rds.amazonaws.com:5432/alphalabs
```

### 4. Configure Environment Variables

Add to your `.env` file (create if it doesn't exist):

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@your-rds-endpoint.amazonaws.com:5432/alphalabs"
```

**Important**: Never commit this file to git! It should be in your `.gitignore`.

### 5. Initialize the Database

Run these commands in your project directory:

```bash
# Generate Prisma client
npx prisma generate

# Create database tables (first time only)
npx prisma migrate dev --name init

# Or push schema without migrations (development)
npx prisma db push
```

### 6. Verify Connection

1. Restart your Next.js development server
2. Go to the **Connections** page in your app
3. You should see "Database Connected" status

## Database Schema

The database includes these tables:

### Users
- Stores user profile information from OAuth
- Links to login history and backtest data

### Login History
- Records each user login
- Tracks IP address, user agent, and provider

### Backtest Configurations
- Saved trading configurations
- Includes asset, interval, EMA settings, strategy mode
- Support for favorites

### Backtest Runs
- Complete history of backtest executions
- Performance metrics (return, win rate, drawdown, etc.)
- Full trade logs stored as JSON

## Troubleshooting

### "Database Not Connected" Error

1. **Check DATABASE_URL**: Make sure it's correctly formatted in `.env`
2. **Security Group**: Ensure port 5432 is open to your IP
3. **RDS Status**: Verify the database is running in AWS Console
4. **Prisma Generate**: Run `npx prisma generate` after any schema changes

### "P1001: Can't reach database server"

- Check if RDS instance is running
- Verify security group allows your IP
- Ensure RDS endpoint is correct

### "P1003: Database does not exist"

Create the database:
```sql
CREATE DATABASE alphalabs;
```

Or use `npx prisma db push` to create it automatically.

## Cost Considerations

- **Free Tier**: 750 hours/month of db.t3.micro for 12 months
- **After Free Tier**: ~$15-25/month for db.t3.micro
- **Storage**: $0.115/GB/month

Consider using [Supabase](https://supabase.com) or [PlanetScale](https://planetscale.com) for free PostgreSQL/MySQL alternatives.

## Alternative: Local SQLite (Development)

For local development without AWS, you can use SQLite:

1. Update `prisma/schema.prisma`:
```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

2. Run migrations:
```bash
npx prisma migrate dev --name init
```

This creates a local `dev.db` file for development.

