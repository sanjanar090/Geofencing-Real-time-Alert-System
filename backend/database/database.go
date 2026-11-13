package database

import (
"context"
"fmt"
"os"
"time"

"github.com/jackc/pgx/v5/pgxpool"
)

func Connect() (*pgxpool.Pool, error) {
databaseURL := os.Getenv("DATABASE_URL")

if databaseURL == "" {
return nil, fmt.Errorf("DATABASE_URL environment variable is missing")
}

ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

pool, err := pgxpool.New(ctx, databaseURL)
if err != nil {
return nil, fmt.Errorf("failed to connect to database: %w", err)
}

if err := pool.Ping(ctx); err != nil {
pool.Close()
return nil, fmt.Errorf("database ping failed: %w", err)
}

return pool, nil
}
