(function defineStore(OpsDemo) {
  "use strict";

  var state = null;
  var listeners = [];

  function ensureSeed() {
    if (!OpsDemo.data.createSeed) {
      throw new Error("Mock seed is not available.");
    }
    return OpsDemo.data.createSeed();
  }

  function getState() {
    if (!state) {
      state = ensureSeed();
    }
    return state;
  }

  function emit(meta) {
    listeners.slice().forEach(function notify(listener) {
      listener(getState(), meta || {});
    });
  }

  function mutate(mutator, meta) {
    var current = getState();
    mutator(current);
    emit(meta || { type: "mutation" });
    return current;
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function unsubscribe() {
      listeners = listeners.filter(function keep(item) { return item !== listener; });
    };
  }

  function reset() {
    state = ensureSeed();
    emit({ type: "reset" });
  }

  function addChange(change) {
    mutate(function append(current) {
      current.configurationRecords.unshift(Object.assign({
        id: OpsDemo.utils.id("CR"),
        occurredAt: new Date().toISOString(),
        actor: current.meta.currentUser.displayName,
        result: "成功",
        canCreateRollbackDraft: false
      }, change));
    }, { type: "change-log", silentRoute: true });
  }

  OpsDemo.core.store = {
    getState: getState,
    mutate: mutate,
    subscribe: subscribe,
    reset: reset,
    addChange: addChange
  };
})(window.OpsDemo);
