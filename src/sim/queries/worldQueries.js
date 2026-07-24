import { listEntities, getEntity } from '../model/worldState.js';
import { fingerprintWorldDefinition } from '../model/worldDefinition.js';
import { checksumCanonical } from '../persistence/canonicalSerialize.js';
import { ENTITY_KINDS } from '../model/entityKinds.js';
import { collectionNameForKind } from '../model/worldState.js';

export function createWorldQueries(definition, state) {
  return {
    getWorldId() {
      return definition.worldId;
    },
    getRevision() {
      return state.revision;
    },
    getCalendar() {
      return { ...state.calendar };
    },
    getDefinitionFingerprint() {
      return fingerprintWorldDefinition(definition);
    },
    getEntity(kind, id) {
      const entity = getEntity(state, kind, id);
      return entity ? structuredClone(entity) : null;
    },
    list(kind, options) {
      return listEntities(state, kind, options).map((e) => structuredClone(e));
    },
    countByKind() {
      const counts = {};
      for (const kind of ENTITY_KINDS) {
        counts[kind] = state[collectionNameForKind(kind)].size;
      }
      return counts;
    },
    getDiagnostics() {
      return structuredClone(state.diagnostics);
    },
    getStateChecksum() {
      return checksumWorldState(state);
    },
  };
}

export function checksumWorldState(state) {
  const payload = {
    calendar: state.calendar,
    revision: state.revision,
  };
  for (const kind of ENTITY_KINDS) {
    const key = collectionNameForKind(kind);
    payload[key] = listEntities(state, kind, { includeDestroyed: true });
  }
  return checksumCanonical(payload);
}
