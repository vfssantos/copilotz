import * as agents from './agents/main.js';
import * as ai from './ai/main.js';
import * as payments from './payments/main.js';
import actionExecutor from './actions/main.js';

export default (shared: any) => {

  // Set up default stripe payment
  const paymentsConfig = {
    apiKey: shared.env.STRIPE_API_KEY,
  }

  const deepAssign = (obj: any, config: any) => {
    Object.keys(obj).forEach((key) => {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        deepAssign(obj[key], config);
      } else {
        Object.assign(obj[key], config);
      }
    });
  }

  deepAssign(payments, paymentsConfig);


  return {
    ...shared,
    modules: {
      agents,
      ai,
      payments,
      actionExecutor
    }
  }
}
