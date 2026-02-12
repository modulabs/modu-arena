export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  githubUsername: string | null;
  githubAvatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  toolTypeId: string;
  sessionHash: string;
  startedAt: Date;
  endedAt: Date | null;
}

export interface UserProfile {
  user: User;
  totalTokensUsed: number;
  totalSessions: number;
  currentRank: number | null;
}
