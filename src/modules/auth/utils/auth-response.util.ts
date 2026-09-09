export interface AuthUserPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export const formatAuthResponse = (
  accessToken: string,
  refreshToken: string,
  user: AuthUserPayload,
  message: string = 'Login successful',
) => {
  return {
    message,
    accessToken,
    refreshToken,
    user,
  };
};
