(function defineSelectors(OpsDemo) {
  "use strict";

  function enabledKnowledgeBases(state) {
    return state.knowledgeBases.filter(function filter(item) { return item.enabled; });
  }

  function availableKnowledgeBases(state) {
    return state.knowledgeBases.filter(function filter(item) {
      return item.enabled && item.retrievalStatus === "available";
    });
  }

  function overviewMetrics(state) {
    return {
      knowledge: { available: availableKnowledgeBases(state).length, total: state.knowledgeBases.length },
      todayCalls: state.consumption.daily[state.consumption.daily.length - 1].calls,
      monthTokensM: state.consumption.monthSummary.totalTokensM
    };
  }

  function actionableTodos(state) {
    return state.overview.pendingItems.filter(function filter(item) { return !item.resolved && item.severity === "error"; });
  }

  function findKnowledgeBase(state, id) {
    return state.knowledgeBases.find(function find(item) { return item.id === id; }) || state.knowledgeBases[0];
  }

  function documentsForKnowledgeBase(state, knowledgeBaseId) {
    return state.documents.filter(function filter(item) { return item.knowledgeBaseId === knowledgeBaseId; });
  }

  function importsForKnowledgeBase(state, knowledgeBaseId) {
    return state.importBatches.filter(function filter(item) { return item.knowledgeBaseId === knowledgeBaseId; });
  }

  OpsDemo.core.selectors = {
    enabledKnowledgeBases: enabledKnowledgeBases,
    availableKnowledgeBases: availableKnowledgeBases,
    overviewMetrics: overviewMetrics,
    actionableTodos: actionableTodos,
    findKnowledgeBase: findKnowledgeBase,
    documentsForKnowledgeBase: documentsForKnowledgeBase,
    importsForKnowledgeBase: importsForKnowledgeBase,
  };
})(window.OpsDemo);
