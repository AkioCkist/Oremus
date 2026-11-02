/** Reads a JWT's claims without verifying it, for asserting what a token grants. */
export const jwtDecode = (token: string) => JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
