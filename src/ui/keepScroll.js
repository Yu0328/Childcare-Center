// Several editor views re-render by overwriting their whole container's innerHTML after every
// add/edit/delete, then re-wiring listeners. On a tall page (the 適性總表 editor, the 適性紀錄
// tabs) that jumps the window back to the top, losing the teacher's place right after they saved
// an entry deep down the form. Capture the scroll offset before the async re-render and restore
// it once the fresh DOM is in place.
//
// On mobile, focusing a form field zooms the viewport in; if that focused element is then
// destroyed by the innerHTML replacement without a blur() first, mobile Safari/Chrome can leave
// the page stuck zoomed in. Desktop doesn't zoom on focus, so only blur there.
const isMobile = () => typeof matchMedia === 'function' && matchMedia('(max-width: 640px)').matches;

export function keepScroll(rerender) {
  if (isMobile()) document.activeElement?.blur();
  const y = window.scrollY;
  return Promise.resolve(rerender()).then(result => {
    window.scrollTo(0, y);
    return result;
  });
}
