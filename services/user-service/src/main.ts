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
