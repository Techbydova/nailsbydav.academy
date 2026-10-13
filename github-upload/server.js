const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;
    process.env[key] = value.replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(path.join(__dirname, '.env'));

const root = __dirname;
const publicDir = path.join(root, 'public');
const uploadDir = path.join(publicDir, 'uploads');
const dataDir = path.join(root, 'data');
const courseContentDir = path.join(dataDir, 'course-content');
const bookingsFile = path.join(dataDir, 'bookings.json');
const contactsFile = path.join(dataDir, 'contacts.json');
const studentsFile = path.join(dataDir, 'students.json');
const coursesFile = path.join(dataDir, 'courses.json');
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(courseContentDir, { recursive: true });
const sessions = new Map();
const port = Number(process.env.PORT) || 3000;
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || '';
const paystackCurrency = (process.env.PAYSTACK_CURRENCY || 'NGN').toUpperCase();
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const courses = readJson(coursesFile, []);

const services = [
  { id: 'polygel-overlay', name: 'PolyGel Overlay', price: 'From $400', duration: '90 min', image: '/assets/gallery/image-10.jpg' },
  { id: 'polygel-tips', name: 'PolyGel Tips', price: 'From $450', duration: '120 min', image: '/assets/gallery/image-11.jpg' },
  { id: 'acrylic-overlay', name: 'Acrylic Overlay', price: 'From $380', duration: '90 min', image: '/assets/gallery/image-12.jpg' },
  { id: 'rubber-base', name: 'Rubber Base Overlay', price: 'From $350', duration: '75 min', image: '/assets/gallery/image-13.jpg' },
  { id: 'russian-manicure', name: 'Russian Manicure', price: '$450', duration: '60 min', image: '/assets/gallery/image-14.jpg' }
];

function sendJson(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    request.on('data', chunk => { length += chunk.length; if (length > 1e6) return reject(new Error('Request body is too large.')); chunks.push(chunk); });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}
async function readBody(request) {
  const raw = await readRawBody(request);
  try {
    return JSON.parse(raw.toString('utf8') || '{}');
  } catch {
    throw new Error('Invalid JSON');
  }
}

function readJson(file, fallback) {
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback; } catch { return fallback; }
}
function writeJson(file, data) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function passwordMatches(password, student) {
  const test = hashPassword(password, student.password.salt).hash;
  return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(student.password.hash, 'hex'));
}
function cookie(request, name) {
  const parts = String(request.headers.cookie || '').split(';').map(value => value.trim());
  const match = parts.find(value => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}
function currentStudent(request) {
  const session = sessions.get(cookie(request, 'nd_session'));
  if (!session || session.expiresAt < Date.now()) return null;
  return readJson(studentsFile, []).find(student => student.id === session.studentId) || null;
}
function hasPaid(student) {
  return String(student?.paymentStatus || '').toUpperCase() === 'COMPLETE';
}
function paymentCheckoutUrl(student) {
  return `/api/paystack/checkout?course=${encodeURIComponent(student.selectedCourse || 'beginner')}`;
}
function courseById(id) {
  return courses.find(course => course.id === id);
}
function readPrivateCourseContent(courseId) {
  const file = path.join(courseContentDir, `${courseId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && data.modules ? data : null;
  } catch {
    return null;
  }
}
function getPrivateLesson(courseId, lessonId) {
  const privateCourse = readPrivateCourseContent(courseId);
  if (!privateCourse) return null;
  for (const module of privateCourse.modules || []) {
    const lesson = (module.lessons || []).find(item => item.id === lessonId);
    if (lesson) return lesson;
  }
  return null;
}
function courseLessonCount(course) {
  return (course?.modules || []).reduce((total, module) => total + module.lessons.filter(lesson => lesson.published).length, 0);
}
function publicCourse(course) {
  if (!course) return null;
  const sanitizeLesson = (lesson) => ({
    id: lesson.id,
    title: lesson.title,
    description: lesson.description || '',
    duration: lesson.duration || '',
    order: lesson.order || 1
  });

  return {
    id: course.id,
    title: course.title,
    slug: course.slug,
    shortDescription: course.shortDescription,
    summary: course.shortDescription,
    description: course.description,
    overview: course.overview || course.description || course.shortDescription,
    price: course.price,
    currency: course.currency,
    displayPrice: course.price === null || course.price === undefined || course.price === '' ? null : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: course.currency || 'ZAR', maximumFractionDigits: 0 }).format(Number(course.price)),
    duration: course.duration,
    level: course.level,
    category: course.category,
    instructor: course.instructor && !/coming soon/i.test(course.instructor.name || '') ? {
      name: course.instructor.name,
      role: course.instructor.role || '',
      bio: course.instructor.bio || '',
      image: course.instructor.image || ''
    } : null,
    requirements: Array.isArray(course.requirements) ? course.requirements : [],
    learningOutcomes: Array.isArray(course.learningOutcomes) ? course.learningOutcomes : [],
    materials: Array.isArray(course.materials) ? course.materials.map(material => ({
      category: material.category || material.type || 'Materials',
      module: material.module || '',
      title: material.title || '',
      summary: material.summary || '',
      type: material.type || 'Materials'
    })) : [],
    faq: Array.isArray(course.faq) ? course.faq.map(item => ({
      question: item.question || '',
      answer: item.answer || ''
    })) : [],
    completionRequirements: course.completionRequirements || { lessonsCompleted: 0, requiredAssignments: 0, requiredQuizzes: 0, minimumQuizScore: 70 },
    thumbnail: course.thumbnail,
    image: course.thumbnail,
    modules: (course.modules || []).map(module => ({
      id: module.id,
      title: module.title,
      description: module.description || '',
      learningObjectives: Array.isArray(module.learningObjectives) ? module.learningObjectives : [],
      duration: module.duration || '',
      order: module.order,
      lessons: (module.lessons || []).filter(lesson => lesson.published !== false).map(sanitizeLesson)
    }))
  };
}
function studentView(student) {
  const allCourseIds = courses.map(course => course.id);
  const selectedCourse = student.selectedCourse && allCourseIds.includes(student.selectedCourse) ? student.selectedCourse : 'beginner';
  const courseIds = [selectedCourse];
  const paymentStatus = String(student.paymentStatus || 'pending').toUpperCase();
  const paidCourse = hasPaid(student) ? selectedCourse : null;
  return { id: student.id, name: student.name, email: student.email, phone: student.phone || '', selectedCourse, paymentStatus, materials: paidCourse ? courseById(paidCourse)?.materials || [] : [], courses: courseIds.map((id, index) => {
    const course = courseById(id);
    const completed = Boolean(student.progress && student.progress[id]);
    const previousComplete = index === 0 || Boolean(student.progress && student.progress[courseIds[index - 1]]);
    const progressValue = student.progress && student.progress[id];
    const lessons = courseLessonCount(course);
    const completedLessons = typeof progressValue === 'number' ? Math.min(progressValue, lessons) : (progressValue && progressValue.completedLessons ? Math.min(Number(progressValue.completedLessons), lessons) : (completed ? lessons : 0));
    let lessonPosition = 0;
    const modules = hasPaid(student) ? (course?.modules || []).map(module => ({
      id: module.id,
      title: module.title,
      description: module.description || '',
      order: module.order,
      lessons: module.lessons.filter(lesson => lesson.published).map(lesson => {
      const position = lessonPosition++;
      return { id: lesson.id, title: lesson.title, duration: lesson.duration || '', completed: position < completedLessons, locked: position > completedLessons };
      })
    })) : [];
    return { id, title: course?.title || 'Course unavailable', lessons, completedLessons, completed: lessons > 0 && completedLessons >= lessons, locked: !previousComplete, modules, progressTrackingAvailable: lessons > 0 };
  }) };
}
function beginSession(response, studentId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { studentId, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14 });
  response.setHeader('Set-Cookie', `nd_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600`);
}

function parseMultipartForm(request) {
  return new Promise((resolve, reject) => {
    const header = request.headers['content-type'] || '';
    const boundaryMatch = header.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) return reject(new Error('Missing multipart boundary.'));
    const boundary = `--${(boundaryMatch[1] || boundaryMatch[2]).trim()}`;
    const chunks = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('error', reject);
    request.on('end', () => {
      const payload = Buffer.concat(chunks);
      const parts = payload.toString('binary').split(boundary);
      const form = { fields: {}, files: {} };
      for (const part of parts) {
        const trimmed = part.replace(/^\r\n/, '').replace(/\r\n--$/g, '').replace(/\n--$/g, '');
        if (!trimmed || trimmed === '--') continue;
        const separatorIndex = trimmed.indexOf('\r\n\r\n');
        if (separatorIndex === -1) continue;
        const headers = trimmed.slice(0, separatorIndex).replace(/\r\n/g, '\n');
        const body = Buffer.from(trimmed.slice(separatorIndex + 4), 'binary');
        const disposition = headers.split('\n').find(line => line.toLowerCase().startsWith('content-disposition:')) || '';
        const nameMatch = disposition.match(/name="([^"]+)"/i);
        const filenameMatch = disposition.match(/filename="([^"]*)"/i);
        const fieldName = nameMatch ? nameMatch[1] : '';
        if (!fieldName) continue;
        const cleaned = body.subarray(0, Math.max(0, body.length - 2));
        if (filenameMatch && filenameMatch[1]) {
          const originalName = filenameMatch[1].replace(/[^a-zA-Z0-9_.-]/g, '_');
          const safeName = `${Date.now()}-${originalName}`;
          const filePath = path.join(uploadDir, safeName);
          fs.writeFileSync(filePath, cleaned);
          form.files[fieldName] = { filename: originalName, path: filePath, url: `/uploads/${safeName}` };
        } else {
          form.fields[fieldName] = cleaned.toString('utf8').trim();
        }
      }
      resolve(form);
    });
  });
}

function serveFile(request, response, pathname) {
  const aliases = {
    '/pricing': '/pricing.html',
    '/terms': '/terms.html',
    '/privacy': '/privacy.html',
    '/refunds': '/refunds.html'
  };
  const requested = pathname === '/' ? '/index.html' : (aliases[pathname] || pathname);
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return sendJson(response, 403, { error: 'Forbidden' });

  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(response, 404, { error: 'Not found' });
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' };
    response.writeHead(200, { 'Content-Type': `${types[path.extname(filePath)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(content);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname === '/api/courses' && request.method === 'GET') return sendJson(response, 200, courses.filter(course => course.published).map(publicCourse));
  const courseDetailsMatch = url.pathname.match(/^\/api\/courses\/([^/]+)$/);
  if (courseDetailsMatch && request.method === 'GET') {
    const course = courses.find(item => item.published && (item.id === courseDetailsMatch[1] || item.slug === courseDetailsMatch[1]));
    return course ? sendJson(response, 200, publicCourse(course)) : sendJson(response, 404, { error: 'Course not found.' });
  }
  const protectedLessonMatch = url.pathname.match(/^\/api\/student\/courses\/([^/]+)\/lessons\/([^/]+)$/);
  if (protectedLessonMatch && request.method === 'GET') {
    const student = currentStudent(request);
    const courseId = protectedLessonMatch[1];
    const lessonId = protectedLessonMatch[2];
    if (!student) return sendJson(response, 401, { error: 'Please log in to access course lessons.' });
    const course = courseById(courseId);
    if (!course || !course.published) return sendJson(response, 404, { error: 'Course not found.' });
    if (!hasPaid(student) || student.selectedCourse !== courseId) return sendJson(response, 403, { error: 'Your account does not have access to this course.' });
    const lesson = getPrivateLesson(courseId, lessonId);
    if (!lesson) return sendJson(response, 404, { error: 'Lesson not found.' });
    let lessonNumber = 0;
    let moduleTitle = '';
    for (const module of course.modules || []) {
      const index = (module.lessons || []).findIndex(item => item.id === lessonId && item.published !== false);
      if (index >= 0) {
        lessonNumber += index + 1;
        moduleTitle = module.title;
        break;
      }
      lessonNumber += (module.lessons || []).filter(item => item.published !== false).length;
    }
    if (!lessonNumber) return sendJson(response, 404, { error: 'Lesson not found.' });
    return sendJson(response, 200, {
      courseId: course.id,
      lessonId: lesson.id,
      lessonNumber,
      moduleTitle,
      title: lesson.title,
      duration: lesson.duration || '',
      overview: lesson.overview || '',
      learningObjectives: Array.isArray(lesson.learningObjectives) ? lesson.learningObjectives : [],
      content: lesson.content || '',
      practicalWorkflow: lesson.practicalWorkflow || '',
      commonMistakes: Array.isArray(lesson.commonMistakes) ? lesson.commonMistakes : [],
      assignment: lesson.assignment || null,
      knowledgeCheck: lesson.knowledgeCheck || null,
      safetyNote: lesson.safetyNote || '',
      keyTerms: Array.isArray(lesson.keyTerms) ? lesson.keyTerms : [],
      video: lesson.video || { status: 'coming_soon', url: null, thumbnail: null, duration: null },
      diagram: lesson.diagram || { status: 'coming_soon', image: null, alt: 'Educational diagram coming soon' },
      resource: lesson.resource || { status: 'coming_soon', type: 'worksheet', url: null, title: 'Worksheet/checklist coming soon' }
    });
  }
  if (url.pathname === '/api/services' && request.method === 'GET') return sendJson(response, 200, services);
  if (url.pathname === '/api/upload-video' && request.method === 'POST') {
    try {
      const contentType = request.headers['content-type'] || '';
      if (!contentType.includes('multipart/form-data')) return sendJson(response, 400, { error: 'Invalid upload format.' });
      const form = await parseMultipartForm(request);
      const file = form.files.video;
      if (!file || !file.url) return sendJson(response, 400, { error: 'No video file was received.' });
      return sendJson(response, 201, { message: 'Video uploaded successfully.', url: file.url, filename: file.filename });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/bookings' && request.method === 'POST') {
    try {
      const booking = await readBody(request);
      const required = ['name', 'email', 'service', 'date'];
      if (required.some(field => !String(booking[field] || '').trim())) return sendJson(response, 400, { error: 'Please complete all required fields.' });
      fs.mkdirSync(dataDir, { recursive: true });
      const existing = fs.existsSync(bookingsFile) ? JSON.parse(fs.readFileSync(bookingsFile, 'utf8')) : [];
      const saved = { id: `booking_${Date.now()}`, ...booking, createdAt: new Date().toISOString() };
      fs.writeFileSync(bookingsFile, JSON.stringify([...existing, saved], null, 2));
      return sendJson(response, 201, { message: 'Your request is in. We will confirm your appointment shortly.', booking: saved });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/contact' && request.method === 'POST') {
    try {
      const contact = await readBody(request);
      const required = ['name', 'email', 'topic', 'message'];
      if (required.some(field => !String(contact[field] || '').trim())) return sendJson(response, 400, { error: 'Please complete all required fields.' });
      fs.mkdirSync(dataDir, { recursive: true });
      const existing = fs.existsSync(contactsFile) ? JSON.parse(fs.readFileSync(contactsFile, 'utf8')) : [];
      const saved = { id: `contact_${Date.now()}`, ...contact, createdAt: new Date().toISOString() };
      fs.writeFileSync(contactsFile, JSON.stringify([...existing, saved], null, 2));
      return sendJson(response, 201, { message: 'Thanks, your enquiry is in. We will be in touch soon.', contact: saved });
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/auth/signup' && request.method === 'POST') {
    try {
      const body = await readBody(request);
      const name = String(body.name || '').trim(), email = String(body.email || '').trim().toLowerCase(), phone = String(body.phone || '').trim(), password = String(body.password || ''), selectedCourse = String(body.course || '').trim();
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || !phone || !courses.some(course => course.id === selectedCourse && course.published) || password.length < 8) return sendJson(response, 400, { error: 'Please complete every field, choose a course, and use a password with at least 8 characters.' });
      const students = readJson(studentsFile, []);
      if (students.some(student => student.email === email)) return sendJson(response, 409, { error: 'An account already exists for this email. Please log in.' });
      const student = { id: `student_${crypto.randomUUID()}`, name, email, phone, selectedCourse, paymentStatus: 'pending', password: hashPassword(password), progress: {}, createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() };
      students.push(student); writeJson(studentsFile, students); beginSession(response, student.id);
      return sendJson(response, 201, { paymentRequired: true, checkoutUrl: paymentCheckoutUrl(student), user: studentView(student) });
    } catch { return sendJson(response, 400, { error: 'We could not create your account. Please try again.' }); }
  }
  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    try {
      const body = await readBody(request), email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
      const students = readJson(studentsFile, []), student = students.find(item => item.email === email);
      if (!student || !passwordMatches(password, student)) return sendJson(response, 401, { error: 'The email or password is incorrect.' });
      student.lastLoginAt = new Date().toISOString(); writeJson(studentsFile, students); beginSession(response, student.id);
      if (!hasPaid(student)) return sendJson(response, 402, { error: 'Payment is required before entering the Student Area.', paymentRequired: true, checkoutUrl: paymentCheckoutUrl(student) });
      return sendJson(response, 200, { user: studentView(student) });
    } catch { return sendJson(response, 400, { error: 'We could not sign you in. Please try again.' }); }
  }
  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    sessions.delete(cookie(request, 'nd_session')); response.setHeader('Set-Cookie', 'nd_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); return sendJson(response, 200, { message: 'Signed out.' });
  }
  if (url.pathname === '/api/auth/me' && request.method === 'GET') {
    const student = currentStudent(request); if (!student) return sendJson(response, 401, { error: 'Please log in.' }); if (!hasPaid(student)) return sendJson(response, 402, { error: 'Payment is required before entering the Student Area.', paymentRequired: true, checkoutUrl: paymentCheckoutUrl(student) }); return sendJson(response, 200, { user: studentView(student) });
  }
  if (url.pathname === '/api/paystack/checkout' && request.method === 'GET') {
    const student = currentStudent(request), course = url.searchParams.get('course') || student?.selectedCourse || 'beginner';
    if (!student) return sendJson(response, 401, { error: 'Please register or log in before paying.' });
    const selectedCourse = courseById(course);
    if (!selectedCourse?.published || !Number.isFinite(Number(selectedCourse.price))) return sendJson(response, 400, { error: 'Course payment is unavailable.' });
    if (!paystackSecretKey) return sendJson(response, 503, { error: 'Paystack is not configured yet. Add PAYSTACK_SECRET_KEY to the server environment.' });
    try {
      const reference = `nd_${student.id}_${Date.now()}`;
      const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: student.email,
          amount: Math.round(Number(selectedCourse.price) * 100),
          currency: paystackCurrency,
          reference,
          callback_url: `${publicBaseUrl}/student-dashboard.html?payment=success`,
          metadata: { studentId: student.id, course },
        }),
      });
      const payment = await paystackResponse.json();
      if (!paystackResponse.ok || !payment.status || !payment.data?.authorization_url) {
        throw new Error(payment.message || 'Paystack rejected the transaction.');
      }
      const students = readJson(studentsFile, []);
      writeJson(studentsFile, students.map(item => item.id === student.id ? { ...item, selectedCourse: course, paystackReference: reference } : item));
      response.writeHead(303, { Location: payment.data.authorization_url });
      return response.end();
    } catch (error) {
      return sendJson(response, 502, { error: `Paystack checkout could not be started: ${error.message}` });
    }
  }
  if (url.pathname === '/api/paystack/webhook' && request.method === 'POST') {
    if (!paystackSecretKey) return sendJson(response, 503, { error: 'Paystack webhook is not configured.' });
    try {
      const raw = await readRawBody(request);
      const signature = crypto.createHmac('sha512', paystackSecretKey).update(raw).digest('hex');
      if (!request.headers['x-paystack-signature'] || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(String(request.headers['x-paystack-signature'])))) {
        return sendJson(response, 400, { error: 'Invalid Paystack webhook signature.' });
      }
      const event = JSON.parse(raw.toString('utf8'));
      if (event.event === 'charge.success' && event.data?.status === 'success') {
        const students = readJson(studentsFile, []);
        const index = students.findIndex(item => item.paystackReference === event.data.reference || item.id === event.data.metadata?.studentId);
        if (index >= 0) {
          students[index].paymentStatus = 'COMPLETE';
          students[index].paymentReference = event.data.reference;
          writeJson(studentsFile, students);
        }
      }
      return sendJson(response, 200, { received: true });
    } catch (error) {
      return sendJson(response, 400, { error: `Invalid Paystack webhook: ${error.message}` });
    }
  }
  if (url.pathname === '/api/student/profile' && request.method === 'POST') {
    try {
      const student = currentStudent(request);
      if (!student) return sendJson(response, 401, { error: 'Please log in to update your profile.' });
      const body = await readBody(request);
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const phone = String(body.phone || '').trim();
      if (!name || !/^\S+@\S+\.\S+$/.test(email) || !phone) return sendJson(response, 400, { error: 'Please complete your name, email, and phone number.' });
      const students = readJson(studentsFile, []);
      if (students.some(item => item.id !== student.id && item.email === email)) return sendJson(response, 409, { error: 'That email address is already in use.' });
      student.name = name; student.email = email; student.phone = phone;
      const index = students.findIndex(item => item.id === student.id); students[index] = student; writeJson(studentsFile, students);
      return sendJson(response, 200, { message: 'Profile updated successfully.', user: studentView(student) });
    } catch { return sendJson(response, 400, { error: 'We could not update your profile.' }); }
  }
  const completeMatch = url.pathname.match(/^\/api\/student\/courses\/([a-z-]+)\/complete$/);
  if (completeMatch && request.method === 'POST') {
    const student = currentStudent(request), courseId = completeMatch[1], order = courses.map(course => course.id);
    if (!student) return sendJson(response, 401, { error: 'Please log in to update progress.' });
    if (!hasPaid(student)) return sendJson(response, 402, { error: 'Payment is required before continuing your course.', paymentRequired: true, checkoutUrl: paymentCheckoutUrl(student) });
    const position = order.indexOf(courseId);
    const course = courseById(courseId), lessonCount = courseLessonCount(course);
    if (!course?.published || position < 0 || (student.selectedCourse && student.selectedCourse !== courseId)) return sendJson(response, 403, { error: 'This course is not part of your enrollment.' });
    student.progress = student.progress || {};
    if (position > 0 && !student.progress[order[position - 1]]) return sendJson(response, 403, { error: 'Complete the previous course to unlock this course.' });
    const currentLessons = typeof student.progress[courseId] === 'number' ? student.progress[courseId] : 0;
    if (currentLessons >= lessonCount) return sendJson(response, 400, { error: 'All lessons in this course are already complete.' });
    student.progress[courseId] = currentLessons + 1;
    const students = readJson(studentsFile, []), index = students.findIndex(item => item.id === student.id);
    students[index] = student; writeJson(studentsFile, students);
    return sendJson(response, 200, { user: studentView(student) });
  }
  const lessonCompleteMatch = url.pathname.match(/^\/api\/student\/courses\/([a-z-]+)\/lessons\/(\d+)\/complete$/);
  if (lessonCompleteMatch && request.method === 'POST') {
    const student = currentStudent(request), courseId = lessonCompleteMatch[1], lessonNumber = Number(lessonCompleteMatch[2]);
    if (!student) return sendJson(response, 401, { error: 'Please log in to update progress.' });
    if (!hasPaid(student)) return sendJson(response, 402, { error: 'Payment is required before continuing your course.', paymentRequired: true, checkoutUrl: paymentCheckoutUrl(student) });
    const course = courseById(courseId), lessonCount = courseLessonCount(course);
    if (!course?.published || (student.selectedCourse && student.selectedCourse !== courseId)) return sendJson(response, 403, { error: 'This lesson is not part of your enrollment.' });
    if (lessonNumber < 1 || lessonNumber > lessonCount) return sendJson(response, 400, { error: 'Lesson not found.' });
    const currentProgress = student.progress && typeof student.progress[courseId] === 'number' ? student.progress[courseId] : 0;
    if (lessonNumber > currentProgress + 1) return sendJson(response, 403, { error: 'Complete the previous lesson first.' });
    student.progress = student.progress || {}; student.progress[courseId] = lessonNumber;
    const students = readJson(studentsFile, []), index = students.findIndex(item => item.id === student.id); students[index] = student; writeJson(studentsFile, students);
    return sendJson(response, 200, { user: studentView(student) });
  }

  serveFile(request, response, url.pathname);
});

server.listen(port, () => console.log(`NailsByDav running at http://localhost:${port}`));
