import express, { Request, Response } from 'express';
import { ServiceName } from '@gateforge/shared';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

let users: User[] = [
  { id: '1', name: 'Alice Smith', email: 'alice@gateforge.com', role: 'admin' },
  { id: '2', name: 'Bob Jones', email: 'bob@gateforge.com', role: 'user' },
  { id: '3', name: 'Charlie Brown', email: 'charlie@gateforge.com', role: 'user' },
];

// GET /users
app.get('/users', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: users,
    timestamp: new Date().toISOString(),
  });
});

// GET /users/me (Inspect identity headers injected by GateForge)
app.get('/users/me', (req: Request, res: Response) => {
  const authType = req.headers['x-auth-type'] || null;
  const userId = req.headers['x-user-id'] || null;
  const userEmail = req.headers['x-user-email'] || null;
  const userRole = req.headers['x-user-role'] || null;
  const consumerId = req.headers['x-consumer-id'] || null;
  const apiKeyId = req.headers['x-api-key-id'] || null;
  const requestId = req.headers['x-request-id'] || req.headers['X-Request-ID'] || null;

  res.status(200).json({
    success: true,
    data: {
      authType,
      userId,
      email: userEmail,
      role: userRole,
      consumerId,
      apiKeyId,
      requestId,
      message: 'Identity headers successfully received from GateForge API Gateway',
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /consumers/me (Inspect M2M API Key identity headers injected by GateForge)
app.get('/consumers/me', (req: Request, res: Response) => {
  const authType = req.headers['x-auth-type'] || null;
  const consumerId = req.headers['x-consumer-id'] || null;
  const apiKeyId = req.headers['x-api-key-id'] || null;
  const role = req.headers['x-user-role'] || null;
  const requestId = req.headers['x-request-id'] || req.headers['X-Request-ID'] || null;

  res.status(200).json({
    success: true,
    data: {
      authType,
      consumerId,
      apiKeyId,
      role,
      requestId,
      message: 'Consumer M2M identity headers successfully verified from GateForge API Gateway',
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /admin (Protected admin endpoint inside User Service)
app.get('/admin', (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] || null;
  const userRole = req.headers['x-user-role'] || null;

  res.status(200).json({
    success: true,
    data: {
      message: 'Welcome to the protected Admin Dashboard endpoint inside User Service!',
      invokedBy: { userId, role: userRole },
    },
    timestamp: new Date().toISOString(),
  });
});

// GET /users/:id
app.get('/users/:id', (req: Request, res: Response) => {
  const user = users.find((u) => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `User with id ${req.params.id} not found` },
      timestamp: new Date().toISOString(),
    });
  }
  res.status(200).json({
    success: true,
    data: user,
    timestamp: new Date().toISOString(),
  });
});

// POST /users
app.post('/users', (req: Request, res: Response) => {
  const { name, email, role } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Name and email are required' },
      timestamp: new Date().toISOString(),
    });
  }

  const id = String(users.length > 0 ? Math.max(...users.map((u) => parseInt(u.id) || 0)) + 1 : 1);
  const newUser: User = {
    id,
    name,
    email,
    role: role || 'user',
  };
  users.push(newUser);

  res.status(201).json({
    success: true,
    data: newUser,
    timestamp: new Date().toISOString(),
  });
});

// PUT /users/:id
app.put('/users/:id', (req: Request, res: Response) => {
  const index = users.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `User with id ${req.params.id} not found` },
      timestamp: new Date().toISOString(),
    });
  }

  const { name, email, role } = req.body || {};
  users[index] = {
    ...users[index],
    name: name ?? users[index].name,
    email: email ?? users[index].email,
    role: role ?? users[index].role,
  };

  res.status(200).json({
    success: true,
    data: users[index],
    timestamp: new Date().toISOString(),
  });
});

// DELETE /users/:id
app.delete('/users/:id', (req: Request, res: Response) => {
  const index = users.findIndex((u) => u.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `User with id ${req.params.id} not found` },
      timestamp: new Date().toISOString(),
    });
  }

  const deletedUser = users[index];
  users.splice(index, 1);

  res.status(200).json({
    success: true,
    data: deletedUser,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`[GateForge] ${ServiceName.USER_SERVICE} running on http://localhost:${PORT}`);
});
