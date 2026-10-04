/*
 * Discussion (forum) helpers — adds a "Reagovat" button to the logged-in
 * user's own posts, which ČSFD natively omits.
 *
 * Extracted from csfd.js; the Csfd class delegates here.
 */
import { POST_PERMALINK_KEY, SELF_REPLY_IN_DISCUSSIONS_KEY, getCsfdPathAliasPattern } from './config.js';
import { getFeatureState } from './utils.js';

const DISCUSSION_PAGE_REGEX = new RegExp(String.raw`/(?:${getCsfdPathAliasPattern('discussion')})/`, 'i');

/**
 * Adds a "Reagovat" button to the logged-in user's own discussion posts.
 * Uses a Vanilla JS proxy-click to trigger the native ČSFD UI.
 */
export function enableSelfReplyInDiscussions() {
  if (!DISCUSSION_PAGE_REGEX.test(window.location.pathname || '')) return;
  if (!getFeatureState(SELF_REPLY_IN_DISCUSSIONS_KEY, true)) return;

  const posts = document.querySelectorAll('article.article-forum');

  posts.forEach((post) => {
    const actionsContainer = post.querySelector('.icon-control');
    if (!actionsContainer) return;

    const hasReplyBtn = actionsContainer.querySelector('.reply-add');

    // If missing, it's your post. Let's inject our proxy button.
    if (!hasReplyBtn) {
      const authorLink = post.querySelector('.article-header-message a.user-title-name');
      if (!authorLink) return;

      // Extract your user info and post ID
      const href = authorLink.getAttribute('href') || '';
      const userMatch = href.match(/\/uzivatel\/(\d+)-([^/]+)\//);
      if (!userMatch) return;

      const userId = userMatch[1];
      const username = authorLink.textContent.trim();

      const articleId = post.getAttribute('id') || '';
      const postMatch = articleId.match(/highlight-post-(\d+)/);
      if (!postMatch) return;

      const postId = postMatch[1];

      // Create our visual button
      const replyBtn = document.createElement('a');
      replyBtn.href = '#';
      replyBtn.className = 'button button-circle reply-add cc-self-reply';
      replyBtn.title = 'Odpovědět (CC)';
      replyBtn.innerHTML = '<i class="icon icon-reply"></i>';

      // The magic: Proxy the click to an existing native button
      replyBtn.addEventListener('click', (e) => {
        e.preventDefault();

        // Find any valid native button on the page from another user
        const nativeBtn = document.querySelector('a.reply-add:not(.cc-self-reply)');

        if (nativeBtn) {
          console.debug(`[CC] Proxying reply click to native button for ${username}`);

          // 1. Backup the native button's original values
          const origNick = nativeBtn.getAttribute('data-nick');
          const origId = nativeBtn.getAttribute('data-id');
          const origPost = nativeBtn.getAttribute('data-post');

          // 2. Override with your post's values
          nativeBtn.setAttribute('data-nick', username);
          nativeBtn.setAttribute('data-id', userId);
          nativeBtn.setAttribute('data-post', postId);

          // 3. Dispatch the native click (this triggers ČSFD's UI formatting)
          nativeBtn.click();

          // 4. Restore the native button immediately so it isn't permanently broken
          nativeBtn.setAttribute('data-nick', origNick);
          nativeBtn.setAttribute('data-id', origId);
          nativeBtn.setAttribute('data-post', origPost);
        } else {
          console.debug('[CC] No native button found. Using simple fallback.');

          // Fallback just in case you are the ONLY person in the discussion
          const textToInsert = `@${username} `;
          if (typeof tinymce !== 'undefined' && tinymce.activeEditor) {
            tinymce.activeEditor.execCommand('mceInsertContent', false, textToInsert);
            tinymce.activeEditor.focus();
          } else {
            const textarea = document.querySelector('form textarea#frm-forum-postForm-text');
            if (textarea) {
              textarea.value = textarea.value ? `${textarea.value} ${textToInsert}` : textToInsert;
              textarea.focus();
            }
          }
        }
      });

      // Insert our button into the actions bar
      actionsContainer.insertBefore(replyBtn, actionsContainer.firstChild);
    }
  });
}

/** Remove all injected self-reply buttons. */
export function clearSelfReplyInDiscussions() {
  document.querySelectorAll('.cc-self-reply').forEach((btn) => btn.remove());
}

const LINK_ICON_SVG =
  '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"></path><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"></path></svg>';

/**
 * Builds a link to one post: current discussion page (keeping ?page=N) + the post anchor.
 */
export function buildPostPermalink(location, postId) {
  return `${location.origin}${location.pathname}${location.search}#highlight-post-${postId}`;
}

/**
 * Adds a "link to this post" icon to the action bar of every discussion post.
 * Pure DOM work, no requests.
 */
export function addPostPermalinks() {
  if (!DISCUSSION_PAGE_REGEX.test(window.location.pathname || '')) return;
  if (!getFeatureState(POST_PERMALINK_KEY, true)) return;

  document.querySelectorAll('article.article-forum').forEach((post) => {
    const actionsContainer = post.querySelector('.icon-control');
    if (!actionsContainer || actionsContainer.querySelector('.cc-post-permalink')) return;

    const postId = (post.getAttribute('id') || '').match(/highlight-post-(\d+)/)?.[1];
    if (!postId) return;

    const link = document.createElement('a');
    link.className = 'button button-circle cc-post-permalink';
    link.href = buildPostPermalink(window.location, postId);
    link.title = 'Odkaz na tento příspěvek (CC)';
    link.setAttribute('aria-label', link.title);
    link.innerHTML = LINK_ICON_SVG;
    actionsContainer.appendChild(link);
  });
}

/** Remove all injected permalink icons. */
export function clearPostPermalinks() {
  document.querySelectorAll('.cc-post-permalink').forEach((el) => el.remove());
}
