// src/prisma.js — singleton Prisma client (avoids multiple connections in dev).
const { PrismaClient } = require('@prisma/client');

const prisma = global.prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.prisma = prisma;

module.exports = prisma;
