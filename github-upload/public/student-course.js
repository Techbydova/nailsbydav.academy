(() => {
  const root = document.querySelector('#student-course-root');
  const params = new URLSearchParams(window.location.search);
  const courseId = params.get('course');
  const selectedLessonId = params.get('lesson');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  let user;
  let course;
  let lessons = [];
  let completedLessons = 0;

  async function requestJson(url, options) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'This request could not be completed.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function outlineMarkup() {
    return course.modules.map((module, moduleIndex) => {
      const moduleLessons = module.lessons || [];
      const moduleCompleted = moduleLessons.filter(lesson => lessons.findIndex(item => item.id === lesson.id) < completedLessons).length;
      const panelId = `learning-module-${moduleIndex + 1}`;
      const open = moduleLessons.some(lesson => lesson.id === selectedLessonId) || (!selectedLessonId && moduleIndex === Math.floor(completedLessons / 5));
      return `<section class="learning-module">
        <h2><button class="learning-module-toggle" type="button" aria-expanded="${open}" aria-controls="${panelId}"><span>${escapeHtml(module.title)}</span><small>${moduleCompleted} / ${moduleLessons.length} lessons</small><span aria-hidden="true">${open ? '−' : '+'}</span></button></h2>
        <div id="${panelId}" class="learning-module-panel"${open ? '' : ' hidden'}>
          ${module.description ? `<p>${escapeHtml(module.description)}</p>` : ''}
          <ol>${moduleLessons.map(lesson => {
            const number = lessons.indexOf(lesson) + 1;
            const done = number <= completedLessons;
            return `<li class="${done ? 'is-completed' : ''}"><a href="/student-course.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lesson.id)}"${lesson.id === selectedLessonId ? ' aria-current="page"' : ''}><span>${escapeHtml(lesson.title)}</span><small>${done ? 'Completed' : escapeHtml(lesson.duration || `Lesson ${number}`)}</small></a></li>`;
          }).join('')}</ol>
        </div>
      </section>`;
    }).join('');
  }

  function renderText(title, text, preline = false) {
    if (!text) return '';
    return `<section class="learning-content-section"><h3>${escapeHtml(title)}</h3><div${preline ? ' class="learning-preline"' : ''}>${escapeHtml(text)}</div></section>`;
  }

  function renderList(title, values) {
    if (!Array.isArray(values) || !values.length) return '';
    return `<section class="learning-content-section"><h3>${escapeHtml(title)}</h3><ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul></section>`;
  }

  function renderKnowledgeCheck(check) {
    if (!check) return '';
    const questions = Array.isArray(check.questions) ? check.questions : check.question ? [check] : [];
    if (!questions.length) return renderText('Knowledge check', check.reflectionQuestion || check.question || 'Review the key ideas from this lesson.');
    return `<section class="learning-content-section"><h3>Knowledge check</h3><form class="learning-quiz">${questions.map((question, questionIndex) => `<fieldset><legend>${questionIndex + 1}. ${escapeHtml(question.question)}</legend>${(question.options || []).map((option, optionIndex) => `<label><input type="radio" name="question-${questionIndex}" value="${optionIndex}" required><span>${escapeHtml(option)}</span></label>`).join('')}</fieldset>`).join('')}<button class="button button-dark" type="submit">Check answers</button><p role="status" class="learning-quiz-result"></p></form>${check.reflectionQuestion ? `<p>${escapeHtml(check.reflectionQuestion)}</p>` : ''}</section>`;
  }

  function renderMedia(title, state, fallback, kind) {
    const available = state?.status === 'available';
    const heading = state?.title || (available ? title : fallback.title);
    let content = `<p>${escapeHtml(available ? title : fallback.message)}</p>`;
    if (available && kind === 'diagram' && state.image) content = `<img src="${escapeHtml(state.image)}" alt="${escapeHtml(state.alt || title)}">`;
    if (available && state.url) content += `<a href="${escapeHtml(state.url)}" target="_blank" rel="noreferrer">Open ${escapeHtml(title.toLowerCase())}</a>`;
    return `<section class="learning-media"><h3>${escapeHtml(heading)}</h3>${content}</section>`;
  }

  function lessonMarkup(lesson, number) {
    const previous = lessons[number - 2];
    const next = lessons[number];
    const canComplete = number === completedLessons + 1;
    const isComplete = number <= completedLessons;
    const assignment = lesson.assignment ? `${lesson.assignment.instructions || ''}${lesson.assignment.expectedOutcome ? `\n\nExpected outcome: ${lesson.assignment.expectedOutcome}` : ''}` : '';
    return `<article class="learning-lesson">
      <p class="eyebrow">${escapeHtml(course.title)} / ${escapeHtml(lesson.moduleTitle || '')} / Lesson ${number}</p>
      <h1>${escapeHtml(lesson.title)}</h1>
      <p class="learning-lesson-duration">${escapeHtml(lesson.duration || '')}</p>
      ${renderText('Overview', lesson.overview)}
      ${renderList('Learning objectives', lesson.learningObjectives)}
      ${renderText('Lesson', lesson.content, true)}
      ${renderText('Practical workflow', lesson.practicalWorkflow, true)}
      ${renderList('Common mistakes', lesson.commonMistakes)}
      ${assignment ? renderText(lesson.assignment.title || 'Practical assignment', assignment, true) : ''}
      ${renderKnowledgeCheck(lesson.knowledgeCheck)}
      ${renderText('Safety note', lesson.safetyNote)}
      ${renderList('Key terms', lesson.keyTerms)}
      <div class="learning-media-grid">
        ${renderMedia('Video', lesson.video, { title: 'Video coming soon', message: "This lesson's demonstration video is being prepared. The written lesson is available now." }, 'video')}
        ${renderMedia('Educational diagram', lesson.diagram, { title: 'Educational diagram coming soon', message: 'An educational diagram will be added when the original teaching visual is ready.' }, 'diagram')}
        ${renderMedia('Worksheet/checklist', lesson.resource, { title: 'Worksheet/checklist coming soon', message: 'A downloadable worksheet or checklist will be added when it is ready.' }, 'resource')}
      </div>
      <div class="learning-navigation">
        ${previous ? `<a class="button button-outline" href="/student-course.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(previous.id)}">Previous Lesson</a>` : '<span></span>'}
        <button class="button ${isComplete ? 'button-outline' : 'button-dark'}" type="button" data-mark-complete${isComplete || !canComplete ? ' disabled' : ''}>${isComplete ? 'Completed' : canComplete ? 'Mark Complete' : 'Complete previous lesson first'}</button>
        ${next ? `<a class="button button-outline" href="/student-course.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(next.id)}">Next Lesson</a>` : '<span></span>'}
      </div>
      <p class="learning-action-status" role="status"></p>
    </article>`;
  }

  function renderPage(lesson = null, lessonNumber = 0) {
    document.title = `${course.title} | My Learning | NailsByDav Academy`;
    const progress = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
    const continueLesson = lessons[Math.min(completedLessons, Math.max(lessons.length - 1, 0))];
    root.innerHTML = `<div class="student-course-layout">
      <section class="student-course-heading">
        <a class="course-back-link" href="/student-dashboard.html">← My learning</a>
        <p class="eyebrow">My course</p><h1>${escapeHtml(course.title)}</h1>
        <p>${completedLessons} of ${progress} lessons completed</p>
        <progress max="${progress || 1}" value="${completedLessons}" aria-label="Course lesson progress"></progress>
        ${continueLesson ? `<a class="text-button" href="/student-course.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(continueLesson.id)}">Continue Learning: ${escapeHtml(continueLesson.title)}</a>` : ''}
      </section>
      <section class="student-course-curriculum"><h2>Modules</h2>${course.modules.length ? outlineMarkup() : '<p>Course lessons are being prepared. Contact the academy for access details.</p>'}</section>
      ${lesson ? lessonMarkup(lesson, lessonNumber) : '<section class="learning-empty"><p>Choose a lesson from a module to continue.</p></section>'}
    </div>`;
    root.querySelectorAll('.learning-module-toggle').forEach(button => button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.closest('h2').nextElementSibling.hidden = expanded;
      button.lastElementChild.textContent = expanded ? '+' : '−';
    }));
    const quiz = root.querySelector('.learning-quiz');
    if (quiz) quiz.addEventListener('submit', event => {
      event.preventDefault();
      const values = new FormData(quiz);
      const questions = Array.isArray(lesson.knowledgeCheck.questions) ? lesson.knowledgeCheck.questions : [lesson.knowledgeCheck];
      const score = questions.reduce((total, question, index) => total + (Number(values.get(`question-${index}`)) === question.correctAnswer ? 1 : 0), 0);
      quiz.querySelector('[role="status"]').textContent = `${score} of ${questions.length} correct.`;
    });
    const completeButton = root.querySelector('[data-mark-complete]');
    if (completeButton && lesson) completeButton.addEventListener('click', async () => {
      completeButton.disabled = true;
      try {
        const result = await requestJson(`/api/student/courses/${encodeURIComponent(courseId)}/lessons/${lessonNumber}/complete`, { method: 'POST' });
        user = result.user;
        completedLessons = user.courses.find(item => item.id === courseId)?.completedLessons || 0;
        renderPage(lesson, lessonNumber);
      } catch (error) {
        const status = root.querySelector('.learning-action-status');
        status.textContent = error.message;
        completeButton.disabled = false;
      }
    });
  }

  async function load() {
    if (!courseId) {
      root.innerHTML = '<p role="status">Choose a course from My Learning.</p>';
      return;
    }
    try {
      const account = await requestJson('/api/auth/me');
      user = account.user;
      if (user.selectedCourse !== courseId || user.paymentStatus !== 'COMPLETE') throw new Error('This course is not part of your paid enrollment.');
      const publicCourse = await requestJson(`/api/courses/${encodeURIComponent(courseId)}`);
      course = publicCourse;
      lessons = course.modules.flatMap(module => module.lessons.map(lesson => ({ ...lesson, moduleTitle: module.title })));
      completedLessons = user.courses.find(item => item.id === courseId)?.completedLessons || 0;
      if (!lessons.length) {
        renderPage();
        return;
      }
      if (!selectedLessonId) {
        renderPage();
        return;
      }
      const outlineLesson = lessons.find(lesson => lesson.id === selectedLessonId);
      if (!outlineLesson) throw new Error('Lesson not found.');
      const result = await requestJson(`/api/student/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(selectedLessonId)}`);
      const lessonNumber = result.lessonNumber;
      renderPage({ ...result, moduleTitle: result.moduleTitle || outlineLesson.moduleTitle }, lessonNumber);
    } catch (error) {
      if (error.status === 401 || error.status === 402) {
        window.location.href = '/student-area.html';
        return;
      }
      root.innerHTML = `<p role="alert">${escapeHtml(error.message)}</p><a class="button button-outline" href="/student-dashboard.html">Back to My Learning</a>`;
    }
  }

  window.addEventListener('popstate', () => window.location.reload());
  load();
})();
