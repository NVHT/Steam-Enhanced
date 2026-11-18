/*
 * Profile (/id/<name>, /profiles/<steamid>): the parts CSS can't do alone.
 *
 *   - Cover: above Steam's 910px breakpoint the profile's art becomes the hero card's cover
 *     (.se-profile-cover). An animated background (.profile_animated_background) moves into it,
 *     so its video plays once; a still background is read from Steam's inline style. The same
 *     art (the video's poster, the still, or else the avatar) is exposed as --se-profile-art for
 *     the blurred page backdrop. Everything moves back below the breakpoint and on destroy.
 *   - Status: Steam's status card (.profile_in_game) mirrored as a status line at the end of
 *     the real name and place. The side card then hides unless it carries a Join Game button.
 *   - Info row (.se-profile-chips, under the avatar and name), four columns: the favourite
 *     badge (moved in), the summary (moved in), the Steam ID and the profile link (click to copy;
 *     the value reads "Copied" for a moment), then two bars built from the side column's count
 *     links: the counts ("3,891 Games"; a zero
 *     count is left out) and the links without one (Inventory, Screenshots...) with a duotone
 *     icon (shared/icons.js). The side column's plain link list hides; badge, award, group and
 *     friend previews stay. IDs come from Steam's own g_rgProfileData; without it no ID chips.
 *   - Level card: hovering the level badge (on the avatar's corner) shows the XP to the next
 *     level, read once from the profile's badges page.
 *   - Name history: the name itself opens Steam's name history (Steam's arrow lies over it);
 *     made reachable by keyboard.
 *   - Summary: always shown in full (CSS); Steam's "View more info" dialog link hides. A blank
 *     line (a break right after a break) loses its second break, so the summary reads as one.
 *   - Recent games and the Favorite Game showcase: each gets wide header art (the 184x69 capsule's header.jpg sibling,
 *     falling back to the capsule), its playtime lines as chips, and an achievement ring with
 *     a percentage computed from "78 / 78" (a "Perfect" chip at 100%). The art also tints the row (--se-art).
 *   - Showcase capsules: Game Collector tiles get the 467x181 capsule (they're drawn wider than
 *     Steam's 184x69), then the header, then the original.
 *   - Game Collector: stats 2x2 beside the games (.se-collector).
 *   - Completionist: the summary row moves above the games.
 *   - Favorite Game: the achievements row moves beside the stat tiles.
 *   - Friend rows: Steam's line break between "In-Game" and the game becomes " · ", so every
 *     row is a name and one status line.
 *   - Count links: a total Steam leaves blank (Inventory's is "&nbsp;") gets [data-se-empty].
 *   - Older markup (header and games as loose left-column siblings) is wrapped into one card.
 *
 * Classes are Steam's (SteamTracking: steamcommunity.com/public/css/skin_1/profilev2.css).
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const WIDE = '(min-width: 911px)';
  const COPIED_MS = 1400;
  const COPIED_TEXT = 'Copied';
  // Any of Steam's store art files (capsule_184x69.jpg, capsule_231x87.jpg, header.jpg...)
  const STORE_ART = /\/(?:capsule_[\w]+|header(?:_alt_assets_\d+)?)(\.(?:jpg|png|webp))/i;
  // Steam's unhashed store art path, by app ID: newer art lives in per-file hashed folders, where
  // a sibling file name 404s, but this path still serves each app's current art
  const STORE_CDN = 'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps';
  // Larger art to try, largest first
  const ART_RECENT = ['header'];
  const ART_FAVORITE = ['capsule_616x353', 'header'];
  const ART_COLLECTOR = ['capsule_467x181', 'header'];
  const FRACTION = /(\d[\d.,\s]*)\/\s*(\d[\d.,\s]*)/;
  const ART_VAR = '--se-profile-art';

  const cssUrl = (value) => value?.match(/url\((['"]?)(.*?)\1\)/)?.[2] || null;
  const toCssUrl = (url) => `url(${JSON.stringify(url)})`;
  const count = (text) => Number(String(text).replace(/[^\d]/g, '')) || 0;
  const capitalize = (text) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

  web.define(async (dom) => {
    const { iconFor, duoIcon } = await Promise.resolve(web.parts.icons);
    const $ = dom.scope();
    const { el, mark, unmark, squash, setText, setVar } = dom;
    const wide = window.matchMedia(WIDE);
    const root = document.documentElement;

    const page = () => document.querySelector('div.profile_page');

    /* ---------- Moves (restored in reverse order) ---------- */

    const moves = [];

    const move = (node, parent, prepend = false) => {
      if (!node || node.parentElement === parent) return false;
      const anchor = document.createComment('se-profile');
      node.before(anchor);
      moves.push([node, anchor]);
      if (prepend) parent.prepend(node);
      else parent.append(node);
      return true;
    };

    const resumeVideo = (scopeNode) => {
      const video = scopeNode?.querySelector('video');
      if (video?.paused) video.play()?.catch(() => {});
    };

    const restoreMoves = () => {
      for (const [node, anchor] of moves.splice(0).reverse()) {
        if (anchor.isConnected) anchor.replaceWith(node);
        else anchor.remove();
        resumeVideo(node);
      }
    };

    /* ---------- Cover and backdrop art ---------- */

    const cover = el('div', { class: 'se-profile-cover', 'aria-hidden': 'true' });
    let art = null;

    // Read once, before [data-se-art] clears Steam's own background
    const findArt = (host) => {
      const video = host.querySelector('.profile_animated_background video');
      if (video?.poster) return video.poster;
      const still =
        cssUrl(host.style.backgroundImage) ||
        cssUrl(getComputedStyle(host).backgroundImage) ||
        cssUrl(getComputedStyle(document.body).backgroundImage);
      if (still) return still;
      const avatar = document.querySelector('.playerAvatar.profile_header_size img');
      return avatar?.currentSrc || avatar?.getAttribute('src') || null;
    };

    const placeCover = () => {
      const host = page();
      const header = host?.querySelector(':scope > .profile_header_bg');
      if (!header) return;

      if (art === null) {
        art = findArt(host) ?? '';
        if (art) setVar(root, ART_VAR, toCssUrl(art));
      }

      if (cover.parentElement !== header) header.prepend(cover);
      const animated = host.querySelector(':scope > .profile_animated_background');
      if (move(animated, cover)) resumeVideo(animated);
      mark(host, 'data-se-art', cover.querySelector('.profile_animated_background') ? 'video' : art ? 'image' : 'none');
    };

    const removeCover = () => {
      restoreMoves();
      cover.remove();
      const host = page();
      if (host) unmark(host, 'data-se-art');
    };

    $.add(() => {
      removeCover();
      root.style.removeProperty(ART_VAR);
    });

    /* ---------- Status pill ---------- */

    const pill = el('span', { class: 'se-profile-status', 'data-se-state': 'offline' });
    $.add(() => {
      pill.remove();
      const host = page();
      if (host) unmark(host, 'data-se-status');
    });

    const syncStatus = () => {
      const box = document.querySelector('.profile_in_game');
      // The status ends the real-name line; a profile without one keeps it beside the name
      const line =
        document.querySelector('.profile_header_centered_persona .header_real_name, .profile_header_centered_col .header_real_name') ??
        document.querySelector('.profile_header_centered_persona .persona_name, .profile_header_centered_col .persona_name');
      if (!box || !line) return;
      const state = box.classList.contains('in-game') ? 'ingame' : box.classList.contains('online') ? 'online' : 'offline';
      const head = squash(box.querySelector('.profile_in_game_header')?.textContent);
      const game = squash(box.querySelector('.profile_in_game_name')?.textContent);
      const text = [head, game].filter(Boolean).join(' · ');
      if (!text) return;
      mark(pill, 'data-se-state', state);
      mark(pill, 'title', text);
      setText(pill, text);
      if (pill.parentElement !== line) line.append(pill);
      const host = page();
      if (host) mark(host, 'data-se-status');
    };

    /* ---------- Chips: badge, IDs, counts and links ---------- */

    const ids = el('div', { class: 'se-profile-ids' });
    const counts = el('nav', { class: 'se-profile-bar', 'data-se-bar': 'counts', 'aria-label': 'Profile stats', hidden: true });
    const sections = el('nav', { class: 'se-profile-bar', 'data-se-bar': 'links', 'aria-label': 'Profile sections', hidden: true });
    const medal = el('div', { class: 'se-profile-medal' });
    const about = el('div', { class: 'se-profile-about' });
    const chips = el('div', { class: 'se-profile-chips' }, [
      medal,
      about,
      ids,
      el('div', { class: 'se-profile-stack' }, [counts, sections]),
    ]);
    let barsSignature = '';
    $.add(() => {
      chips.remove();
      const host = page();
      if (host) unmark(host, 'data-se-stats');
    });

    const countSegment = (link, label, total) =>
      el('a', { class: 'se-profile-seg', href: link.href, title: `${label}: ${total}` }, [
        el('strong', { text: total }),
        el('span', { text: label }),
      ]);

    const linkSegment = (link, label) =>
      el('a', { class: 'se-profile-seg', href: link.href, title: label }, [
        duoIcon(iconFor(link.getAttribute('href') ?? '') ?? 'profile'),
        el('span', { text: label }),
      ]);

    // Steam leaves some totals blank (Inventory's is "&nbsp;"): those are links. A count of 0
    // has nothing behind it and is left out.
    const placeBars = () => {
      const links = [...document.querySelectorAll('.profile_rightcol .profile_count_link a[href]')];
      const signature = links.map((link) => `${link.href}|${squash(link.textContent)}`).join('\n');
      if (signature === barsSignature) return;
      barsSignature = signature;
      const countItems = [];
      const linkItems = [];
      for (const link of links) {
        const label = squash(link.querySelector('.count_link_label')?.textContent) || squash(link.textContent);
        const total = squash(link.querySelector('.profile_count_link_total')?.textContent.replace(/ /g, ' '));
        if (!total) linkItems.push(linkSegment(link, label));
        else if (count(total)) countItems.push(countSegment(link, label, total));
      }
      counts.replaceChildren(...countItems);
      sections.replaceChildren(...linkItems);
      counts.hidden = !countItems.length;
      sections.hidden = !linkItems.length;
      const host = page();
      if (!host) return;
      if (links.length) mark(host, 'data-se-stats');
      else unmark(host, 'data-se-stats');
    };

    const placeChips = () => {
      const content = page()?.querySelector('.profile_header_content');
      if (!content) return;
      if (chips.parentElement !== content) content.append(chips);
      placeBars();
    };

    // Wide only (restored with the cover's moves): the favourite badge and the summary join the
    // info row, badge first, summary second
    const placeBadge = () => {
      const badge = document.querySelector('.profile_header_badgeinfo .profile_header_badge');
      if (badge?.querySelector('.favorite_badge')) move(badge, medal);
      move(document.querySelector('.profile_header_content .profile_header_summary'), about);
    };

    /* ---------- ID chips ---------- */

    // The whole chip is the copy button. "Copied" shows over the value for a moment (CSS, from
    // [data-se-copied]): the value stays in place, so the chip keeps its width
    const chip = (label, shown, value) => {
      const text = el('span', { class: 'se-profile-chip-value', text: shown });
      const node = el('button', { class: 'se-profile-chip', type: 'button', 'aria-label': `Copy ${label}`, title: `Copy ${label}` }, [
        el('b', { text: label }),
        text,
      ]);
      let timer = 0;
      const reset = () => {
        node.removeAttribute('data-se-copied');
        text.removeAttribute('data-se-copied');
      };
      $.listen(node, 'click', async (event) => {
        event.preventDefault();
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          return;
        }
        node.setAttribute('data-se-copied', '');
        text.setAttribute('data-se-copied', COPIED_TEXT);
        clearTimeout(timer);
        timer = setTimeout(reset, COPIED_MS);
      });
      $.add(() => clearTimeout(timer));
      return node;
    };

    // Steam sets g_rgProfileData in an inline script that may run after this module
    const placeIds = () => {
      const profile = window.g_rgProfileData;
      if (!ids.querySelector('.se-profile-chip') && profile) {
        if (profile.steamid) ids.append(chip('Steam ID', String(profile.steamid), String(profile.steamid)));
        if (profile.url) {
          const url = String(profile.url);
          const path = url.replace(/^https?:\/\/(?:www\.)?steamcommunity\.com/i, '').replace(/\/$/, '');
          ids.append(chip('Profile link', path || url, url));
        }
      }
    };

    /* ---------- Level card ---------- */

    // The level badge sits on the avatar's corner; hovering or focusing it shows the XP to the
    // next level. Steam's profile doesn't carry it: the badges page does (.profile_xp_block_*),
    // fetched once, the first time the card opens.
    const levelCard = el('span', { class: 'se-level-card', role: 'tooltip', id: 'se-level-card' });
    const levelTitle = el('strong', { class: 'se-level-card-title' });
    const levelNext = el('span', { class: 'se-level-card-next' });
    const levelBar = el('span', { class: 'se-level-card-bar', hidden: true }, [el('span')]);
    const levelXp = el('span', { class: 'se-level-card-xp' });
    levelCard.append(
      el('span', { class: 'se-level-card-head' }, [levelTitle, levelNext]),
      levelBar,
      el('span', { class: 'se-level-card-foot' }, [levelXp, el('span', { class: 'se-level-card-open', text: 'View badges' })]),
    );
    let levelLink = null;
    let levelLoad = null;
    const levelAbort = new AbortController();

    $.add(() => {
      levelAbort.abort();
      levelCard.remove();
      if (levelLink) {
        unmark(levelLink, 'aria-describedby');
        unmark(levelLink, 'data-se-level');
      }
    });

    const loadLevel = () => {
      const url = window.g_rgProfileData?.url;
      if (levelLoad || !url) return;
      levelLoad = fetch(`${String(url).replace(/\/?$/, '/')}badges/`, { credentials: 'same-origin', signal: levelAbort.signal })
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const next = squash(doc.querySelector('.profile_xp_block_remaining')?.textContent);
          const xp = squash(doc.querySelector('.profile_xp_block_xp')?.textContent);
          const width = doc.querySelector('.profile_xp_block_remaining_bar_progress')?.style.width;
          setText(levelNext, next);
          setText(levelXp, xp);
          if (width) {
            levelBar.firstChild.style.setProperty('--se-pct', width);
            levelBar.hidden = false;
          }
        })
        .catch(() => {});
    };

    const placeLevel = () => {
      const link = document.querySelector('.profile_header_badgeinfo .persona_level')?.closest('a');
      const level = squash(link?.querySelector('.friendPlayerLevelNum')?.textContent);
      if (!link || !level) return;
      if (levelLink !== link) {
        levelLink = link;
        mark(link, 'data-se-level');
        mark(link, 'aria-describedby', levelCard.id);
        $.listen(link, 'pointerenter', loadLevel);
        $.listen(link, 'focus', loadLevel);
      }
      setText(levelTitle, `Level ${level}`);
      if (levelCard.parentElement !== link) link.append(levelCard);
    };

    /* ---------- Name history ---------- */

    // Steam's arrow (.namehistory_link, onclick ShowAliasPopup) is stretched over the name in
    // CSS, so clicking the name opens Steam's own popup under it. It's a bare span: it gets a
    // role, a name and Enter / Space.
    const HISTORY_ATTRS = { role: 'button', tabindex: '0', 'aria-label': 'Name history', 'data-se-history': '' };
    let historyLink = null;

    const onHistoryKey = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.currentTarget.click();
    };

    const placeHistory = () => {
      const link = document.querySelector('.profile_header_centered_persona .namehistory_link, .profile_header_centered_col .namehistory_link');
      if (!link || link === historyLink) return;
      historyLink = link;
      for (const [name, value] of Object.entries(HISTORY_ATTRS)) mark(link, name, value);
      $.listen(link, 'keydown', onHistoryKey);
    };

    $.add(() => {
      if (historyLink) for (const name of Object.keys(HISTORY_ATTRS)) unmark(historyLink, name);
    });

    /* ---------- Summary: blank lines ---------- */

    const gaps = new Set();

    const isBlank = (node) => node?.nodeType === Node.TEXT_NODE && !node.textContent.trim();

    const markGaps = () => {
      for (const br of document.querySelectorAll('.profile_header_summary .profile_summary br:not([data-se-gap])')) {
        let prev = br.previousSibling;
        while (isBlank(prev)) prev = prev.previousSibling;
        if (prev?.nodeName !== 'BR') continue;
        mark(br, 'data-se-gap');
        gaps.add(br);
      }
    };

    $.add(() => {
      for (const br of gaps) unmark(br, 'data-se-gap');
      gaps.clear();
    });

    /* ---------- Recent games ---------- */

    const games = new Map(); // .recent_game -> { img, src, onError, parts[] }

    const appIdOf = (game, src) =>
      src.match(/\/apps\/(\d+)\//)?.[1] ?? game.querySelector('a[href*="/app/"]')?.getAttribute('href').match(/\/app\/(\d+)/)?.[1];

    // Each name tried as a sibling of Steam's file, then at the app's unhashed path
    const artCandidates = (game, src, names = game.matches('.favoritegame_showcase') ? ART_FAVORITE : ART_RECENT) => {
      const id = appIdOf(game, src);
      const urls = names.flatMap((name) => [
        STORE_ART.test(src) ? src.replace(STORE_ART, `/${name}$1`) : null,
        id ? `${STORE_CDN}/${id}/${name}.jpg` : null,
      ]);
      return [...new Set(urls.filter((url) => url && url !== src))];
    };

    const upgradeArt = (game, record) => {
      const img = game.querySelector('.game_info_cap img, .favorite_game_cap img');
      const src = img?.getAttribute('src');
      if (!src) return;
      setVar(game, '--se-art', toCssUrl(src));
      const candidates = artCandidates(game, src);
      if (!candidates.length) return;
      record.img = img;
      record.src = src;
      // A failure moves to the next candidate; past the last, back to Steam's own
      record.onError = () => {
        const at = candidates.indexOf(img.getAttribute('src'));
        if (at !== -1) img.setAttribute('src', candidates[at + 1] ?? src);
      };
      // The frame takes the shape of whatever loaded, so a fallback is never cropped
      record.onLoad = () => {
        if (img.naturalWidth && img.naturalHeight) setVar(img, '--se-art-ratio', `${img.naturalWidth} / ${img.naturalHeight}`);
      };
      img.addEventListener('error', record.onError);
      img.addEventListener('load', record.onLoad);
      img.setAttribute('src', candidates[0]);
    };

    const metaChips = (game, record) => {
      const details = game.querySelector('.game_info_details');
      if (!details) return;
      const lines = [...details.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => squash(node.textContent))
        .filter(Boolean);
      if (!lines.length) return;
      const meta = el('div', { class: 'se-recent-meta' }, lines.map((line) => el('span', { text: capitalize(line) })));
      details.after(meta);
      record.parts.push(meta);
    };

    // An SVG ring (pathLength 100, so the dash offset is the percentage left) with the percentage in
    // its middle; it takes the place of Steam's ribbon at the start of the row
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const ringCircle = (cls) => {
      const circle = document.createElementNS(SVG_NS, 'circle');
      for (const [name, value] of Object.entries({ class: cls, cx: '20', cy: '20', r: '17', pathLength: '100' })) {
        circle.setAttribute(name, value);
      }
      return circle;
    };

    const progressRing = (game, record) => {
      const summary = game.querySelector('.game_info_achievement_summary');
      const row = summary?.closest('.game_info_achievements');
      const match = (summary?.querySelector('a') ?? summary)?.textContent.match(FRACTION);
      if (!row || !match) return;
      const total = count(match[2]);
      if (!total) return;
      const pct = Math.min(100, Math.round((count(match[1]) / total) * 100));
      const complete = pct === 100;

      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 40 40');
      svg.setAttribute('aria-hidden', 'true');
      svg.append(ringCircle('se-ach-ring-track'), ringCircle('se-ach-ring-fill'));

      const ring = el(
        'div',
        {
          class: 'se-ach-ring',
          role: 'progressbar',
          'aria-label': 'Achievement progress',
          'aria-valuemin': '0',
          'aria-valuemax': '100',
          'aria-valuenow': String(pct),
          'data-se-complete': complete,
        },
        [svg, el('span', { text: `${pct}%` })],
      );
      ring.style.setProperty('--se-pct', String(pct));
      row.prepend(ring);
      record.parts.push(ring);

      if (complete) {
        const chip = el('span', { class: 'se-ach-perfect', text: 'Perfect' });
        summary.append(chip);
        record.parts.push(chip);
      }
    };

    const enhanceGames = () => {
      for (const game of document.querySelectorAll('.recent_game, .favoritegame_showcase')) {
        if (games.has(game)) continue;
        const record = { parts: [] };
        games.set(game, record);
        upgradeArt(game, record);
        metaChips(game, record);
        progressRing(game, record);
        mark(game, 'data-se-recent');
      }
    };

    $.add(() => {
      for (const [game, record] of games) {
        for (const part of record.parts) part.remove();
        if (record.img) {
          record.img.removeEventListener('error', record.onError);
          record.img.removeEventListener('load', record.onLoad);
          record.img.style.removeProperty('--se-art-ratio');
          record.img.setAttribute('src', record.src);
        }
        game.style.removeProperty('--se-art');
        unmark(game, 'data-se-recent');
      }
      games.clear();
    });

    /* ---------- Showcase capsules ---------- */

    // Game Collector tiles are drawn wider than Steam's 184x69 capsule: the 467x181 capsule (then
    // the header) through the same sibling / app-ID fallbacks as the recent games
    const sharpened = new Map(); // img -> { src, onError }

    const sharpenCapsules = () => {
      for (const img of document.querySelectorAll('.showcase_gamecollector_game img.game_capsule')) {
        if (sharpened.has(img)) continue;
        const src = img.getAttribute('src') ?? '';
        const slot = img.closest('.showcase_gamecollector_game');
        const candidates = src && slot ? artCandidates(slot, src, ART_COLLECTOR) : [];
        if (!candidates.length) continue;
        const onError = () => {
          const at = candidates.indexOf(img.getAttribute('src'));
          if (at !== -1) img.setAttribute('src', candidates[at + 1] ?? src);
        };
        sharpened.set(img, { src, onError });
        img.addEventListener('error', onError);
        img.setAttribute('src', candidates[0]);
      }
    };

    $.add(() => {
      for (const [img, { src, onError }] of sharpened) {
        img.removeEventListener('error', onError);
        img.setAttribute('src', src);
      }
      sharpened.clear();
    });

    /* ---------- Game Collector: stats sidebar ---------- */

    // The stats, the "Featured Games" label and the grid move into one grid (.se-collector): stats
    // 2x2 on the left, the label and games on the right. Everything moves back on destroy.
    const collectorMoves = []; // [node, comment holding its place]
    const collectorShells = [];

    const arrangeCollectors = () => {
      for (const games of document.querySelectorAll('.showcase_gamecollector_games')) {
        if (games.closest('.se-collector')) continue;
        const block = games.closest('.profile_customization_block');
        const stats = block?.querySelector('.showcase_stats_row');
        if (!stats) continue;
        const before = games.previousElementSibling;
        const label = before && !before.matches('.showcase_stats_row') && !before.children.length ? before : null;

        const shell = el('div', { class: 'se-collector' });
        block.prepend(shell);
        collectorShells.push(shell);
        for (const node of [stats, label, games]) {
          if (!node) continue;
          const anchor = document.createComment('se-profile-collector');
          node.before(anchor);
          collectorMoves.push([node, anchor]);
          shell.append(node);
        }
        if (label) mark(label, 'data-se-collector-label');
      }
    };

    $.add(() => {
      for (const [node, anchor] of collectorMoves.splice(0).reverse()) {
        unmark(node, 'data-se-collector-label');
        if (anchor.isConnected) anchor.replaceWith(node);
      }
      for (const shell of collectorShells.splice(0)) shell.remove();
    });

    /* ---------- Completionist: summary first ---------- */

    // Steam puts the summary row (Completed Games, Sets, Avg. rate) after the games, at a depth CSS
    // order can't reach: it moves to the top of the showcase, and back on destroy
    const summaryMoves = []; // [row, comment holding its place]

    const liftSummaries = () => {
      for (const slots of document.querySelectorAll('.showcase_achievementscompletionist_slots')) {
        const block = slots.closest('.profile_customization_block');
        const row = block?.querySelector('.showcase_stats_row');
        if (!row || block.firstElementChild === row) continue;
        const anchor = document.createComment('se-profile-summary');
        row.before(anchor);
        summaryMoves.push([row, anchor]);
        block.prepend(row);
        mark(row, 'data-se-summary');
      }
    };

    $.add(() => {
      for (const [row, anchor] of summaryMoves.splice(0)) {
        unmark(row, 'data-se-summary');
        if (anchor.isConnected) anchor.replaceWith(row);
      }
    });

    /* ---------- Favorite Game: achievements beside the stat tiles ---------- */

    // Steam puts the achievements row under the showcase's box; it moves into the box's grid, next to
    // the stat tiles, and back on destroy
    const favoriteMoves = [];

    const liftFavoriteAchievements = () => {
      for (const showcase of document.querySelectorAll('.favoritegame_showcase')) {
        const grid = showcase.querySelector('.showcase_content_bg');
        const stats = showcase.querySelector('.game_info_stats');
        if (!grid || !stats || stats.parentElement === grid) continue;
        const anchor = document.createComment('se-profile-favorite');
        stats.before(anchor);
        favoriteMoves.push([stats, anchor]);
        grid.append(stats);
      }
    };

    $.add(() => {
      for (const [stats, anchor] of favoriteMoves.splice(0)) {
        if (anchor.isConnected) anchor.replaceWith(stats);
      }
    });

    /* ---------- Older markup: recent activity as loose siblings ---------- */

    const recent = el('div', { class: 'se-profile-recent' });
    const looseMoves = [];

    const wrapLooseRecent = () => {
      if (recent.isConnected) return;
      const header = document.querySelector('.profile_leftcol > .profile_recentgame_header');
      if (!header) return;
      header.before(recent);
      let node = header;
      while (node && !node.matches('.profile_comment_area, [data-se-own]')) {
        const next = node.nextElementSibling;
        const anchor = document.createComment('se-profile-recent');
        node.before(anchor);
        looseMoves.push([node, anchor]);
        recent.append(node);
        node = next;
      }
    };

    $.add(() => {
      for (const [node, anchor] of looseMoves.splice(0)) {
        if (anchor.isConnected) anchor.replaceWith(node);
      }
      recent.remove();
    });

    /* ---------- Friend status on one line ---------- */

    // Steam breaks "In-Game<br>Cyberpunk 2077": the break becomes " · " so every friend row is
    // two lines, and comes back on destroy
    const joined = []; // [separator text node, original <br>]

    const joinFriendStatus = () => {
      for (const br of document.querySelectorAll('.profile_topfriends .friendSmallText [class^="linkFriend_"] br')) {
        if (!br.nextSibling || !squash(br.nextSibling.textContent)) continue;
        const separator = document.createTextNode(' · ');
        br.replaceWith(separator);
        joined.push([separator, br]);
      }
    };

    $.add(() => {
      for (const [separator, br] of joined.splice(0)) {
        if (separator.isConnected) separator.replaceWith(br);
      }
    });

    /* ---------- Empty count chips ---------- */

    const tagTotals = () => {
      for (const total of document.querySelectorAll('.profile_count_link_total')) {
        if (squash(total.textContent.replace(/ /g, ' '))) unmark(total, 'data-se-empty');
        else mark(total, 'data-se-empty');
      }
    };

    $.add(() => {
      for (const total of document.querySelectorAll('.profile_count_link_total[data-se-empty]')) total.removeAttribute('data-se-empty');
    });

    /* ---------- Run ---------- */

    const scan = () => {
      if (wide.matches) {
        placeCover();
        placeBadge();
      }
      syncStatus();
      placeIds();
      placeChips();
      placeLevel();
      placeHistory();
      markGaps();
      tagTotals();
      joinFriendStatus();
      sharpenCapsules();
      arrangeCollectors();
      liftSummaries();
      liftFavoriteAchievements();
      wrapLooseRecent();
      enhanceGames();
    };

    $.listen(wide, 'change', () => (wide.matches ? scan() : removeCover()));
    $.observe(scan, { attributes: ['class'], filter: (record) => record.type !== 'attributes' || record.target.matches?.('.profile_in_game') });
    scan();

    return () => $.destroy();
  });
})();
