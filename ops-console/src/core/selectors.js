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

  function availableCapabilities(state) {
    var skills = state.skills.filter(function filter(item) { return item.enabled && item.status !== "unavailable"; }).length;
    var tools = state.tools.filter(function filter(item) { return item.enabled && item.status !== "unavailable"; }).length;
    var visualizations = state.visualizations.filter(function filter(item) {
      return item.integrationStatus === "integrated" && item.runtimeStatus !== "disabled_by_skill" && item.runtimeStatus !== "unavailable";
    }).length;
    return { available: skills + tools + visualizations, total: state.skills.length + state.tools.length + state.visualizations.length };
  }

  function overviewMetrics(state) {
    var capabilities = availableCapabilities(state);
    return {
      knowledge: { available: availableKnowledgeBases(state).length, total: state.knowledgeBases.length },
      capabilities: capabilities,
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

  function latestCandidateVersion(state, knowledgeBaseId) {
    return state.knowledgeVersions.find(function find(item) {
      return item.knowledgeBaseId === knowledgeBaseId && (item.status === "pending_validation" || item.status === "pending_activation" || item.status === "building");
    });
  }

  function dependentSkills(state, toolId) {
    return state.skills.filter(function filter(skill) {
      return ((skill.dependencies && skill.dependencies.toolIds) || []).indexOf(toolId) >= 0;
    });
  }

  function documentsForKnowledgeBase(state, knowledgeBaseId) {
    return state.documents.filter(function filter(item) { return item.knowledgeBaseId === knowledgeBaseId; });
  }

  function importsForKnowledgeBase(state, knowledgeBaseId) {
    return state.importBatches.filter(function filter(item) { return item.knowledgeBaseId === knowledgeBaseId; });
  }

  function versionsForKnowledgeBase(state, knowledgeBaseId) {
    return state.knowledgeVersions.filter(function filter(item) { return item.knowledgeBaseId === knowledgeBaseId; });
  }

  OpsDemo.core.selectors = {
    enabledKnowledgeBases: enabledKnowledgeBases,
    availableKnowledgeBases: availableKnowledgeBases,
    availableCapabilities: availableCapabilities,
    overviewMetrics: overviewMetrics,
    actionableTodos: actionableTodos,
    findKnowledgeBase: findKnowledgeBase,
    latestCandidateVersion: latestCandidateVersion,
    dependentSkills: dependentSkills,
    documentsForKnowledgeBase: documentsForKnowledgeBase,
    importsForKnowledgeBase: importsForKnowledgeBase,
    versionsForKnowledgeBase: versionsForKnowledgeBase
  };
})(window.OpsDemo);
