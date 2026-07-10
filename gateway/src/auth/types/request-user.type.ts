export interface RequestUser {
  id: string;
  email: string;
  role: string;
  sub?: string;
  [key: string]: any;
}
