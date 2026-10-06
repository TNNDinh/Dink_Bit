UPDATE "RateLimit"
SET "expiresAt" = ("expiresAt" AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE 'UTC';
