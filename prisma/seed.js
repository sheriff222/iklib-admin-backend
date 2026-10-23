// prisma/seed.js — shared seed data for the admin and student backends.
// Run after the database schema has been installed: npm run seed
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const DEFAULT_PASSWORD = 'Password123!';

async function upsertMembership({ userId, universityId, role, schoolIdNumber, admissionYear, idNumber, isPrimaryAdmin = false }) {
  return prisma.userUniversity.upsert({
    where: { universityId_schoolIdNumber: { universityId, schoolIdNumber } },
    update: { userId, role, admissionYear, idNumber, isPrimaryAdmin },
    create: { userId, universityId, role, schoolIdNumber, admissionYear, idNumber, isPrimaryAdmin },
  });
}

async function upsertUser({ email, name, role, schoolIdNumber, universityId, admissionYear, idNumber, verificationStatus = 'verified', contact }) {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, verificationStatus, contact, passwordHash },
    create: { name, email, contact, passwordHash, role, verificationStatus },
  });
  await upsertMembership({ userId: user.id, universityId, role, schoolIdNumber, admissionYear, idNumber, isPrimaryAdmin: role === 'admin' });
  return user;
}

async function main() {
  const university = await prisma.university.upsert({
    where: { code: 'UNIMTECH' },
    update: { name: 'University of Management and Technology', active: true },
    create: { name: 'University of Management and Technology', code: 'UNIMTECH', description: 'University of Management and Technology', active: true },
  });

  const levelDefinitions = [
    { name: 'School', pluralName: 'Schools', order: 0 },
    { name: 'Department', pluralName: 'Departments', order: 1 },
    { name: 'Module', pluralName: 'Modules', order: 2 },
  ];
  const levelTypes = {};
  for (const definition of levelDefinitions) {
    levelTypes[definition.name] = await prisma.levelType.upsert({
      where: { universityId_name: { universityId: university.id, name: definition.name } },
      update: definition,
      create: { universityId: university.id, ...definition },
    });
  }

  const nodeDefinitions = [
    { key: 'adminSchool', name: 'Administration', type: 'School', parent: null, fieldValues: { code: 'ADM' } },
    { key: 'csSchool', name: 'School of Computing', type: 'School', parent: null, fieldValues: { code: 'COMP' } },
    { key: 'adminDepartment', name: 'Administration', type: 'Department', parent: 'adminSchool', fieldValues: { code: 'ADM' } },
    { key: 'csDepartment', name: 'Computer Science', type: 'Department', parent: 'csSchool', fieldValues: { code: 'CS' } },
    { key: 'dataStructures', name: 'Data Structures', type: 'Module', parent: 'csDepartment', fieldValues: { code: 'CS201' } },
    { key: 'algorithms', name: 'Algorithms', type: 'Module', parent: 'csDepartment', fieldValues: { code: 'CS202' } },
  ];
  const nodes = {};
  for (const definition of nodeDefinitions) {
    const parentId = definition.parent ? nodes[definition.parent].id : null;
    const existing = await prisma.hierarchyLevel.findFirst({
      where: { universityId: university.id, levelTypeId: levelTypes[definition.type].id, name: definition.name, parentId },
    });
    nodes[definition.key] = existing || await prisma.hierarchyLevel.create({
      data: { universityId: university.id, levelTypeId: levelTypes[definition.type].id, parentId, name: definition.name, fieldValues: definition.fieldValues },
    });
  }

  const admin = await upsertUser({
    email: 'admin@iklib.edu', name: 'Iklib Super Admin', contact: '+23200000000', role: 'super_admin',
    universityId: university.id, schoolIdNumber: '24/ADM/UNIMTECH/001', admissionYear: 2024, idNumber: '001',
  });
  await upsertMembership({
    userId: admin.id, universityId: university.id, role: 'admin', schoolIdNumber: '24/ADM/UNIMTECH/001',
    admissionYear: 2024, idNumber: '001', isPrimaryAdmin: true,
  });

  await upsertUser({
    email: 'uploader@iklib.edu', name: 'Iklib Uploader', contact: '+23200000001', role: 'sub_admin',
    universityId: university.id, schoolIdNumber: '24/CS/UNIMTECH/002', admissionYear: 2024, idNumber: '002',
  });
  await upsertUser({
    email: 'student@iklib.edu', name: 'Aminata Kamara', contact: '+23200000002', role: 'student', verificationStatus: 'pending',
    universityId: university.id, schoolIdNumber: '25/CS/UNIMTECH/029', admissionYear: 2025, idNumber: '029',
  });

  const paperExists = await prisma.examPaper.findFirst({ where: { hierarchyLevelId: nodes.dataStructures.id, year: 2023 } });
  if (!paperExists) {
    await prisma.examPaper.create({
      data: {
        title: 'Data Structures — Final Examination 2023', hierarchyName: nodes.dataStructures.name,
        hierarchyLevelId: nodes.dataStructures.id, universityId: university.id, year: 2023, examType: 'Final',
        duration: '3 hours', instructions: 'Answer any four questions. All questions carry equal marks.', status: 'published',
        publishedAt: new Date(), fileKeys: [], fileUrls: [], uploadedById: admin.id, reviewedById: admin.id,
        questions: { create: [
          { text: 'Explain the difference between a stack and a queue. Give one real-world example of each.', marks: 10, order: 1, hierarchyLevelId: nodes.dataStructures.id, universityId: university.id, source: 'manual' },
          { text: 'Implement (in pseudo-code) an insertion sort and state its worst-case time complexity.', marks: 10, order: 2, hierarchyLevelId: nodes.dataStructures.id, universityId: university.id, source: 'manual' },
          { text: 'Define a binary search tree and describe the conditions under which it becomes unbalanced.', marks: 10, order: 3, hierarchyLevelId: nodes.dataStructures.id, universityId: university.id, source: 'manual' },
        ] },
      },
    });
  }

  console.log(`Seed complete. Login: admin@iklib.edu / ${DEFAULT_PASSWORD}`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
