/*
 * A group's members without the offline ones (the members menu, flyouts.js). Steam's list is a
 * virtualized list of fixed slots, so rows can't be hidden by CSS (they'd leave holes): the
 * component that draws it (its render reads GroupMemberStore.GetGroupMemberList, rank buckets)
 * is handed copies of those buckets without offline members while it renders. The store itself
 * is untouched for every other caller (counts, other views), and Steam's name filter still runs
 * on the trimmed buckets. The component is a MobX observer: its first render puts a reactive
 * render on the instance, so that one is wrapped too, keeping its properties (friend-menu.js).
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { run } = SE;

  const WRAPPED = Symbol('se-online-members');
  let hook = null; // { proto, original, store, getList }
  let rendering = null; // the list component while it renders

  const isOnline = (member) => run(() => member.persona.is_online) !== false;

  // A bucket's copy with its online members only (the same class, as Steam's own filter builds)
  function onlineBuckets(buckets, list) {
    const out = [];
    for (const bucket of buckets) {
      const members = bucket.member_list.filter(isOnline);
      if (members.length === bucket.member_list.length) {
        out.push(bucket);
        continue;
      }
      if (!members.length) continue;
      const copy = run(() => {
        const next = new bucket.constructor(bucket.id, list.SortedPlayerSortFunc, () => {});
        next.SetMembers(members);
        return next;
      });
      out.push(copy || bucket);
    }
    return out;
  }

  // render, with the store's buckets trimmed while it runs
  function trimming(render) {
    const wrapped = function (...args) {
      const outer = rendering;
      rendering = this;
      try {
        return render.apply(this, args);
      } finally {
        rendering = outer;
      }
    };
    wrapped[WRAPPED] = true;
    return wrapped;
  }

  // An instance's own (MobX reactive) render, wrapped once, its properties kept (its reaction)
  function wrapOwn(instance) {
    const own = Object.prototype.hasOwnProperty.call(instance, 'render') ? instance.render : null;
    if (typeof own !== 'function' || own[WRAPPED]) return;
    run(() => {
      const reactive = trimming(own);
      for (const key of Reflect.ownKeys(own)) {
        if (!['length', 'name', 'prototype'].includes(key)) Object.defineProperty(reactive, key, Object.getOwnPropertyDescriptor(own, key));
      }
      instance.render = reactive;
    });
  }

  // The list component's class, from a drawn list (its instance builds Steam's filtered buckets)
  function listComponent(win) {
    const list = win.querySelector('.MemberListColumn .chatRoomMembers');
    for (let fiber = list && SE.fiber(list); fiber; fiber = fiber.return) {
      if (typeof fiber.stateNode?.BuildFilteredBuckets === 'function') return fiber.stateNode;
    }
    return null;
  }

  function install(win) {
    if (hook) return;
    const instance = listComponent(win);
    const store = run(() => ns.app().GroupMemberStore);
    const proto = instance && Object.getPrototypeOf(instance);
    if (typeof proto?.render !== 'function' || typeof store?.GetGroupMemberList !== 'function') return;

    const original = proto.render;
    const first = trimming(original);
    // A list drawn later: its first render through the class, then MobX's own one wrapped
    proto.render = function (...args) {
      const element = first.apply(this, args);
      wrapOwn(this);
      return element;
    };
    const wrappedRender = proto.render;

    const getList = store.GetGroupMemberList;
    store.GetGroupMemberList = function (...args) {
      const buckets = getList.apply(this, args);
      if (!rendering || !hook || !Array.isArray(buckets)) return buckets;
      return run(onlineBuckets, buckets, rendering) || buckets;
    };
    hook = { proto, original, wrappedRender, store, getList, wrappedList: store.GetGroupMemberList };
    // The list already drawn renders through its own reactive render, not the class's
    wrapOwn(instance);
    run(() => instance.forceUpdate());
  }

  function uninstall() {
    if (!hook) return;
    if (hook.proto.render === hook.wrappedRender) hook.proto.render = hook.original;
    if (hook.store.GetGroupMemberList === hook.wrappedList) hook.store.GetGroupMemberList = hook.getList;
    hook = null;
  }

  Object.assign(ns, { hideOfflineMembers: install, showOfflineMembers: uninstall });
})(window.__se);
