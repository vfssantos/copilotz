import * as agents from './agents/main.js';
import * as ai from './ai/main.js';
import actionExecutor from './actions/main.js';

export default (shared: any) => {

  return {
    ...shared,
    modules: {
      agents,
      ai,
      actionExecutor
    }
  }
}
