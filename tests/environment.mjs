// Fixture servers use isolated schemas and no real Platform identity service.
// This preload affects test child processes only, never the running app or .env.
process.env.CODEITZ_PLATFORM_AUTH = '0';
