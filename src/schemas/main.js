import actions from './actions/main.js';
import configs from './configs/main.js';
import copilotz from './copilotz/main.js';
import jobs from './jobs/main.js';
import logs from './logs/main.js';
import steps from './steps/main.js';
import subscriptions from './subscriptions/main.js';
import tasks from './tasks/main.js';
import users from './users/main.js';
import workflows from './workflows/main.js';

export default {
    actions,
    configs,
    copilotz,
    jobs,
    logs,
    steps,
    subscriptions,
    tasks,
    users,
    workflows,
}


const migrations = [];

// 1. add workflows to copilotz and jobs
migrations.push(`
alter table copilotz add column workflows text
alter table jobs add column workflows text
`);

export { migrations };