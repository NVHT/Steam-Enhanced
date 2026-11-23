/*
 * Valve Hardware Survey, rebuilt as one flow of three steps: Ask, Review, Sent. Every step
 * keeps Steam's header as the eyebrow over a step title, under a three-part step bar. Ask says
 * in a line what the survey is and that it's anonymous, above Steam's own question; Review shows
 * the four headline specs (SE.survey, client/dialogs/system-info.js) with Steam's sections
 * folded under All details; Sent thanks and points to the results.
 *
 * Steam renders the steps two ways (sp.js, the hardware survey module): ConfirmDialogs with
 * className HardwareSurveyDialog (the prompt, the review with its sections, the thanks), and
 * the monthly popup's three panels (HardwareSurveyDialog + Desktop: DialogHeader, a body, the
 * footer). Ask is told by its Prompt node; Review by its sections, or while it gathers by its
 * disabled Submit; Sent by neither. System Information shares the classes and is left to
 * system-info.js.
 *
 * Steam's nodes stay mounted and React keeps owning them: its long texts are kept for screen
 * readers but not drawn (survey.css), and the buttons are still Steam's.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialogs.
 */
((SE) => {
  window.__seSurvey?.destroy();

  const OURS = 'se-survey';
  const ROOT = 'data-se-survey';
  const OPEN = 'data-se-survey-open';
  const DIALOG = `.${SE.C.HardwareSurveyDialog}`;
  const PROMPT = `.${SE.C.Prompt}`;
  const SECTIONS = `.${SE.C.HardwareSurveySections}`;

  // [step, title, line under it]: the step bar's order
  const STEPS = [
    ['ask', 'Share your hardware', 'Each month Steam asks which hardware and software players use, to guide what Valve builds.'],
    ['review', 'What will be sent', ''],
    ['sent', 'Thanks for taking part', 'See how your PC compares with other players in the monthly results.'],
  ];

  const attempt = SE.attempt('Hardware survey');
  const { el } = SE;
  const isOurs = SE.inside(`.${OURS}`);

  // While gathering, Review has Steam's throbber and a Submit marked disabled (Steam's DialogButton
  // marks it by class or aria, not always the attribute)
  const GATHERING = '.DialogBodyText .SteamLogoThrobber, .DialogFooter .DialogButton.Primary:is(:disabled, .Disabled, [aria-disabled="true"])';

  const stepOf = (root) => {
    if (root.querySelector(PROMPT)) return 'ask';
    if (root.querySelector(SECTIONS) || root.querySelector(GATHERING)) return 'review';
    return 'sent';
  };

  const buildBar = (index) => {
    const bar = el('div', `${OURS} ${OURS}-steps`);
    bar.setAttribute('aria-hidden', 'true');
    STEPS.forEach((_, i) => bar.append(el('span', i <= index ? `${OURS}-step ${OURS}-step-done` : `${OURS}-step`)));
    return bar;
  };

  const buildSpecs = (root) => {
    const sections = attempt(() => SE.survey?.readSections(root), []) || [];
    const { tiles = [] } = attempt(() => SE.survey?.summarise(sections), {}) || {};
    const specs = el('div', `${OURS} ${OURS}-specs`);
    for (const tile of tiles) {
      const spec = el('div', `${OURS}-spec`);
      spec.append(
        el('span', `${OURS}-spec-label`, tile.label),
        el('span', `${OURS}-spec-value`, tile.value),
        el('span', `${OURS}-spec-sub`, tile.sub),
      );
      specs.append(spec);
    }
    return { specs, count: sections.length };
  };

  const createView = (root) => {
    if (root.hasAttribute('data-se-sysinfo') || attempt(() => SE.survey?.isSystemInfo(root), false)) return null;
    const header = root.querySelector('.DialogHeader');
    const body = root.querySelector('.DialogBodyText');
    if (!header || !body) return null;
    const step = stepOf(root);
    const index = STEPS.findIndex(([id]) => id === step);
    const [, title, line] = STEPS[index];

    // Around Steam's header, which doesn't change while the step is open
    const nodes = [buildBar(index), el('div', `${OURS} ${OURS}-title se-dialog-name`, title)];
    header.before(nodes[0]);
    header.after(nodes[1]);
    if (line) {
      const lede = el('div', `${OURS} ${OURS}-lede`, line);
      body.append(lede);
      nodes.push(lede);
    }
    if (step === 'ask') {
      const note = el('div', `${OURS} ${OURS}-note`, 'Anonymous, never tied to your account');
      body.append(note);
      nodes.push(note);
    }

    // Review: the headline specs, then a toggle for Steam's sections (they arrive after gathering)
    let specs = null;
    let more = null;
    const placeReview = () => {
      if (step !== 'review' || !root.querySelector(SECTIONS)) return;
      const built = buildSpecs(root);
      if (!built.count || (specs && Number(specs.dataset.count) === built.count)) return;
      specs?.remove();
      specs = built.specs;
      specs.dataset.count = String(built.count);
      body.append(specs);
      if (!more) {
        more = el('button', `${OURS} ${OURS}-more`);
        more.append(el('span', `${OURS}-more-text`));
        more.type = 'button';
        more.setAttribute('aria-expanded', 'false');
        more.addEventListener('click', () => {
          const open = !root.hasAttribute(OPEN);
          SE.attr(root, OPEN, open ? '' : null);
          more.setAttribute('aria-expanded', String(open));
        });
        body.append(more);
      }
      more.firstChild.textContent = `All details · ${built.count} sections`;
    };
    placeReview();

    SE.attr(root, ROOT, step);
    return {
      root,
      step,
      update: placeReview,
      destroy() {
        for (const node of [...nodes, specs, more]) node?.remove();
        SE.unmark(root, ROOT);
        SE.unmark(root, OPEN);
      },
    };
  };

  // Set once SE.mount returns: its first scan runs inside the call, before there are views
  let mounted = null;
  mounted = SE.mount(
    'Hardware survey',
    () => {
      /*
       * A step read before Steam filled it in can be wrong (the review before its sections):
       * a view whose step no longer matches is dropped, and this scan builds it again. The
       * review's sections arrive once Steam has gathered them.
       */
      for (const [root, view] of mounted?.views ?? []) {
        if (stepOf(root) === view.step) {
          view.update();
          continue;
        }
        view.destroy();
        mounted.views.delete(root);
      }
      return [...document.querySelectorAll(DIALOG)].filter((node) => !node.closest('.GamepadMode'));
    },
    createView,
    // Inside the observer's own callback: rebuilt before the dialog's first paint, so Steam's
    // look never shows
    { sync: true, scope: DIALOG, ignore: isOurs }
  );

  window.__seSurvey = {
    destroy() {
      mounted.destroy();
      delete window.__seSurvey;
    },
  };
})(window.__se);
