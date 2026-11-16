UPDATE "Tournament"
SET "status" = 'REGISTRATION_CLOSE'
WHERE "registrationOpen" = false AND "status" = 'REGISTRATION_OPEN';
