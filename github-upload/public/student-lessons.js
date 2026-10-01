document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-open-lesson]');
  if (!button) return;
  const courseId = button.dataset.courseId;
  const lessonId = button.dataset.openLesson;
  if (!courseId || !lessonId) return;
  window.location.href = `/student-course.html?course=${encodeURIComponent(courseId)}&lesson=${encodeURIComponent(lessonId)}`;
});
