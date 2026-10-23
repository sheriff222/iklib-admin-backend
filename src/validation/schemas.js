// src/validation/schemas.js — Zod schemas for request bodies.
const { z } = require('zod');

// School ID like 25/CS/TEC/029 → [admissionYear, departmentCode, schoolCode, idNumber]
const schoolIdRegex = /^\d{2}\/[A-Za-z]+\/[A-Za-z]+\/\d+$/;

const signupSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  contact: z.string().optional(),
  password: z.string().min(8).max(200),
  schoolIdNumber: z.string().regex(schoolIdRegex, 'Expected format 25/CS/TEC/029'),
  universityId: z.string().min(1),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

const verificationRequestSchema = z.object({
  note: z.string().max(1000).optional(),
  idPhotoUrl: z.string().url().optional(),
  channel: z.enum(['in_app', 'whatsapp']).default('in_app'),
});

// Structured AI-extraction output we validate before it reaches the review form.
const subPartSchema = z.object({
  partLabel: z.string().max(20).nullable().optional(),
  text: z.string().min(1),
  marks: z.number().int().nonnegative().nullable().optional(),
  order: z.number().int().nonnegative().optional(),
});

const questionSchema = z.object({
  text: z.string().min(1),
  marks: z.number().int().nonnegative().nullable().optional(),
  parts: z.array(subPartSchema).optional(),
  generateAiAnswer: z.boolean().optional(),
  source: z.string().optional(),
});
const extractionSchema = z.object({
  hierarchyLevelName: z.string().optional(), // denormalized display name
  year: z.number().int().optional(),
  examType: z.string().optional(),
  duration: z.string().optional(),
  instructions: z.string().optional(),
  questions: z.array(questionSchema).default([]),
});

const publishSchema = extractionSchema.extend({
  title: z.string().min(1),
  universityId: z.string().min(1),
  hierarchyLevelId: z.string().min(1),
  semester: z.string().max(40).optional(),
  fileKeys: z.array(z.string()).default([]),
  fileUrls: z.array(z.string()).default([]),
  rawDraftId: z.string().optional(),
});

const draftSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1).optional(),
  semester: z.string().max(40).optional(),
  hierarchyLevelId: z.string().optional(),
  universityId: z.string().optional(),
  year: z.number().int().optional(),
  examType: z.string().optional(),
  duration: z.string().optional(),
  instructions: z.string().optional(),
  questions: z.array(questionSchema).default([]),
  fileKeys: z.array(z.string()).default([]),
  fileUrls: z.array(z.string()).default([]),
  // Template fields
  examDate: z.string().datetime().optional(),
  totalMarks: z.number().int().nonnegative().nullable().optional(),
  sectionHeaders: z.array(z.object({
    title: z.string(),
    fromQ: z.number().int(),
    toQ: z.number().int(),
  })).optional(),
  numberingStyle: z.string().optional(),
});

const generateAnswersSchema = z.object({
  questionIds: z.array(z.string().min(1)).min(1),
});

const petitionSchema = z.object({
  universityId: z.string().min(1),
  hierarchyLevelId: z.string().optional(),
  year: z.number().int().optional(),
  examType: z.string().optional(),
  note: z.string().max(1000).optional(),
});

const commentSchema = z.object({ text: z.string().min(1).max(2000) });

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  contact: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(['sub_admin', 'admin', 'super_admin']),
  universityId: z.string().min(1),
  schoolIdNumber: z.string().regex(schoolIdRegex),
  admissionYear: z.number().int().optional(),
  idNumber: z.string().optional(),
});

// University management schemas
const levelTypeFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['string', 'text', 'number', 'boolean', 'date', 'select']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  placeholder: z.string().optional(),
});

const levelTypeSchema = z.object({
  name: z.string().min(1).max(80),
  order: z.number().int().min(0),
  pluralName: z.string().max(80).optional(),
  description: z.string().max(500).optional(),
  fieldSchema: z.object({ fields: z.array(levelTypeFieldSchema) }).default({ fields: [] }),
});

const createUniversitySchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(2).max(20).toUpperCase(),
  description: z.string().max(1000).optional(),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  levelTypes: z.array(levelTypeSchema).optional(),
});

const updateUniversitySchema = createUniversitySchema.partial();

const createLevelTypeSchema = levelTypeSchema;
const updateLevelTypeSchema = levelTypeSchema.partial();

const reorderLevelTypesSchema = z.object({
  orderedIds: z.array(z.string()),
});

const hierarchyNodeSchema = z.object({
  levelTypeId: z.string().min(1),
  parentId: z.string().nullable().optional(),
  name: z.string().min(1).max(200),
  fieldValues: z.record(z.unknown()).default({}),
});

const createHierarchyLevelSchema = hierarchyNodeSchema;
const updateHierarchyLevelSchema = hierarchyNodeSchema.partial();

const customFieldSchema = z.object({
  fieldName: z.string().min(1).max(80),
  label: z.string().min(1).max(100),
  fieldType: z.enum(['text', 'number', 'date', 'select', 'multiselect', 'boolean']).default('text'),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
});

module.exports = {
  signupSchema,
  loginSchema,
  verificationRequestSchema,
  subPartSchema,
  questionSchema,
  extractionSchema,
  publishSchema,
  draftSchema,
  generateAnswersSchema,
  petitionSchema,
  commentSchema,
  createUserSchema,
  schoolIdRegex,
  // University schemas
  createUniversitySchema,
  updateUniversitySchema,
  levelTypeSchema,
  createLevelTypeSchema,
  updateLevelTypeSchema,
  reorderLevelTypesSchema,
  createHierarchyLevelSchema,
  updateHierarchyLevelSchema,
  customFieldSchema,
};
