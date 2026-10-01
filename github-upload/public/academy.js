const academyEsc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const academyPrice = course => course.price === null || course.price === undefined || course.price === '' ? '' : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: course.currency || 'ZAR', maximumFractionDigits: 0 }).format(Number(course.price));
const academyMeta = course => [course.duration, course.level, course.category].filter(Boolean);
const academyStatus = (element, message, state = '') => {
  element.dataset.state = state;
  element.innerHTML = `<p role="status">${academyEsc(message)}</p>`;
};
const academyListItems = items => (Array.isArray(items) ? items : []).map(value => `<li>${academyEsc(value)}</li>`).join('');
const academyFormatType = value => {
  if (!value) return 'Lesson';
  const normalized = String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
const academySummaryText = value => String(value ?? '').trim().replace(/\r?\n+/g, ' ');

async function getPublicCourse(path) {
  if (path === '/api/courses' && typeof publicCourses === 'function') return publicCourses();
  const response = await fetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Course information is unavailable.');
  return data;
}

function courseCard(course) {
  const meta = academyMeta(course);
  const price = academyPrice(course);
  const detailHref = `/course-details.html?id=${encodeURIComponent(course.id)}`;
  return `<article class="public-course-card">
    <img src="${academyEsc(course.thumbnail || '/assets/gallery/image-01.jpg')}" alt="${academyEsc(course.title)} course">
    <div class="public-course-card-body">
      <h2>${academyEsc(course.title)}</h2>
      <p>${academyEsc(course.shortDescription || 'Course information coming soon.')}</p>
      ${price ? `<strong>${academyEsc(price)}</strong>` : ''}
      ${meta.length ? `<ul class="course-card-meta">${meta.map(value => `<li>${academyEsc(value)}</li>`).join('')}</ul>` : ''}
      <div class="public-course-actions">
        <a class="text-button" href="${detailHref}">View course</a>
        <button class="button button-light" type="button" data-enroll-course="${academyEsc(course.id)}">Enroll</button>
      </div>
    </div>
  </article>`;
}

async function renderCourseCatalog() {
  const list = document.querySelector('#course-list');
  if (!list) return;
  academyStatus(list, 'Loading courses...');
  try {
    const courses = await getPublicCourse('/api/courses');
    if (!Array.isArray(courses) || !courses.length) {
      academyStatus(list, 'Courses are unavailable right now. Please try again later.', 'error');
      return;
    }
    list.innerHTML = courses.map(courseCard).join('');
  } catch {
    academyStatus(list, 'Courses are unavailable right now. Please try again later.', 'error');
  }
}

function detailSection(title, content, className = '') {
  const sectionClass = className ? ` course-detail-section ${className}` : 'course-detail-section';
  return content ? `<section class="${sectionClass.trim()}"><h2>${academyEsc(title)}</h2>${content}</section>` : '';
}

function renderCourseMaterials(materials) {
  if (!Array.isArray(materials) || !materials.length) return '';
  const groups = new Map();
  materials.forEach(item => {
    const category = String(item.category || item.type || 'Materials').trim() || 'Materials';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });

  const groupsHtml = [...groups.entries()].map(([category, items]) => `
    <div class="course-material-card">
      <h3>${academyEsc(category)}</h3>
      <ul>${items.map(item => `<li><strong>${academyEsc(item.title || 'Material')}</strong><p>${academyEsc(item.summary || item.type || 'Material list item')}</p></li>`).join('')}</ul>
    </div>
  `).join('');

  return `<div class="course-material-grid">${groupsHtml}</div>`;
}

function renderCourseModules(course) {
  const modules = (course.modules || []).filter(module => Array.isArray(module.lessons) && module.lessons.length);
  if (!modules.length) return '';

  return modules.map(module => {
    const lessons = (module.lessons || []).map(lesson => {
      const meta = lesson.duration ? `<small>${academyEsc(lesson.duration)}</small>` : '';
      const description = lesson.description ? `<p>${academyEsc(academySummaryText(lesson.description))}</p>` : '';
      return `<li class="course-outline-lesson"><div><strong>${academyEsc(lesson.title)}</strong>${description}</div>${meta}</li>`;
    }).join('');
    const panelId = `course-module-panel-${academyEsc(module.id || module.order)}`;
    const expanded = Number(module.order) === 1;

    return `<section class="course-module">
      <h3 class="course-module-heading"><button class="course-module-toggle" type="button" aria-expanded="${expanded}" aria-controls="${panelId}"><span>${academyEsc(module.title)}</span><small>${(module.lessons || []).length} lessons</small><span class="course-module-chevron" aria-hidden="true">${expanded ? '−' : '+'}</span></button></h3>
      <div class="course-module-panel" id="${panelId}"${expanded ? '' : ' hidden'}>
      ${module.description ? `<p class="course-module-description">${academyEsc(academySummaryText(module.description))}</p>` : ''}
      <ol class="course-outline-list">${lessons}</ol>
      </div>
    </section>`;
  }).join('');
}

function renderCourseFaq(faq) {
  if (!Array.isArray(faq) || !faq.length) return '';
  return `<div class="course-faq">${faq.map(item => `<details><summary>${academyEsc(item.question || 'Question')}</summary><p>${academyEsc(item.answer || 'Answer coming soon.')}</p></details>`).join('')}</div>`;
}

async function courseActionMarkup(courseId) {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('No active paid session.');
    const result = await response.json();
    if (result.user?.paymentStatus === 'COMPLETE' && result.user?.selectedCourse === courseId) {
      return `<a class="button button-dark" href="/student-course.html?course=${encodeURIComponent(courseId)}">Continue Course</a>`;
    }
  } catch {
    return `<button class="button button-dark" type="button" data-enroll-course="${academyEsc(courseId)}">Enroll Now</button>`;
  }
  return `<button class="button button-dark" type="button" data-enroll-course="${academyEsc(courseId)}">Enroll Now</button>`;
}

function renderCourseDetails(course) {
  const root = document.querySelector('#course-details');
  const meta = academyMeta(course);
  const price = academyPrice(course);
  const overview = academySummaryText(course.overview || course.description || course.shortDescription || 'Course information coming soon.');
  const shortOverview = academySummaryText(course.shortDescription || course.description || overview);
  const requirements = academyListItems(course.requirements || []);
  const outcomes = academyListItems(course.learningOutcomes || []);
  const instructorName = course.instructor?.name || '';
  const instructorRole = course.instructor?.role || '';
  const instructorBio = course.instructor?.bio || '';
  const instructorImage = course.instructor?.image || '';
  const courseMaterials = renderCourseMaterials(course.materials || []);
  const faq = renderCourseFaq(course.faq || []);
  const completionRequirements = course.completionRequirements || {};
  const completionItems = [
    completionRequirements.lessonsCompleted ? `<li>Complete ${completionRequirements.lessonsCompleted} lessons</li>` : '',
    completionRequirements.requiredAssignments ? `<li>Complete ${completionRequirements.requiredAssignments} practical assignments</li>` : '',
    completionRequirements.requiredQuizzes ? `<li>Pass ${completionRequirements.requiredQuizzes} quiz${completionRequirements.requiredQuizzes > 1 ? 'zes' : ''}${completionRequirements.minimumQuizScore ? ` with at least ${completionRequirements.minimumQuizScore}%` : ''}</li>` : ''
  ].filter(Boolean).join('');

  document.title = `${course.title} | NailsByDav Academy`;
  const moduleMarkup = renderCourseModules(course) || '';
  courseActionMarkup(course.id).then((courseAction) => {
    root.innerHTML = `<article class="course-details-content">
      <a class="course-back-link" href="/courses.html">← All courses</a>
      <header class="course-detail-header">
        <div class="course-detail-copy">
          <p class="eyebrow">NailsByDav Academy</p>
          <h1>${academyEsc(course.title)}</h1>
          <p class="course-overview">${academyEsc(shortOverview)}</p>
          ${meta.length ? `<ul class="course-detail-meta">${meta.map(value => `<li>${academyEsc(value)}</li>`).join('')}</ul>` : ''}
          ${price ? `<strong class="course-detail-price">${academyEsc(price)}</strong>` : ''}
          ${courseAction}
        </div>
        <img class="course-detail-image" src="${academyEsc(course.thumbnail || '/assets/gallery/image-01.jpg')}" alt="${academyEsc(course.title)} course">
      </header>
      ${detailSection('Course overview', `<p class="course-overview-copy">${academyEsc(overview)}</p>`, 'course-overview-section')}
      ${outcomes ? detailSection('Learning outcomes', `<ul>${outcomes}</ul>`) : ''}
      ${requirements ? detailSection('Requirements', `<ul>${requirements}</ul>`) : ''}
      ${courseMaterials ? detailSection('Student materials', courseMaterials) : ''}
      ${detailSection('Course curriculum', moduleMarkup || '<p>Course curriculum details are being prepared.</p>')}
      ${instructorName ? detailSection('Instructor', `<div class="course-instructor">${instructorImage ? `<img src="${academyEsc(instructorImage)}" alt="${academyEsc(instructorName)}">` : ''}<div><strong>${academyEsc(instructorName)}</strong>${instructorRole ? `<p>${academyEsc(instructorRole)}</p>` : ''}${instructorBio ? `<p class="course-instructor-bio">${academyEsc(instructorBio)}</p>` : ''}</div></div>`) : ''}
      ${completionItems ? detailSection('Course completion requirements', `<ul>${completionItems}</ul>`) : ''}
      ${faq ? detailSection('FAQ', faq) : ''}
      <section class="course-detail-section course-enroll-cta">
        <h2>Ready to enroll?</h2>
        <p>Join the ${academyEsc(course.title)} course and continue your learning with a clear, practical structure.</p>
        ${courseAction}
      </section>
    </article>`;
    root.querySelectorAll('.course-module-toggle').forEach(button => button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      document.getElementById(button.getAttribute('aria-controls')).hidden = expanded;
      button.querySelector('.course-module-chevron').textContent = expanded ? '+' : '−';
    }));
  });
}

async function loadCourseDetails() {
  const root = document.querySelector('#course-details');
  if (!root) return;
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('id') || params.get('course');
  if (!courseId) {
    academyStatus(root, 'Course not found. Choose a course from the catalog.', 'error');
    return;
  }
  academyStatus(root, 'Loading course...');
  try {
    const course = await getPublicCourse(`/api/courses/${encodeURIComponent(courseId)}`);
    renderCourseDetails(course);
  } catch (error) {
    academyStatus(root, error.message === 'Course not found.' ? error.message : 'Course information is unavailable right now. Please try again later.', 'error');
  }
}

renderCourseCatalog();
loadCourseDetails();