// Script to update managerId for agents based on provided mapping
// Usage: node backend/scripts/updateManagerAssignments.js

// Load environment variables (DB config)
require('dotenv').config();
const { User, sequelize } = require('../models');

// Collapse multiple spaces and trim
const normalize = (s) => (s || '').replace(/\s+/g, ' ').trim();

// Try to locate a user by several heuristics
async function findUserByDisplay(displayName) {
  const name = normalize(displayName);
  // 1) Try username exact
  let user = await User.findOne({ where: { username: name } });
  if (user) return user;

  // 2) Try firstName + lastName exact split
  const parts = name.split(' ');
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  if (firstName && lastName) {
    user = await User.findOne({ where: { firstName, lastName } });
    if (user) return user;
  }

  // 3) If name ends with 'Agent', try matching first part as firstName and lastName='Agent'
  if (/\sAgent$/i.test(name)) {
    const base = name.replace(/\sAgent$/i, '');
    const baseParts = base.split(' ');
    const fn = baseParts[0];
    const ln = 'Agent';
    if (fn) {
      user = await User.findOne({ where: { firstName: fn, lastName: ln } });
      if (user) return user;
    }
  }

  // 4) Fallback: try case-insensitive username-like search
  const candidates = await User.findAll({ where: {} });
  const lower = name.toLowerCase();
  user = candidates.find(u => normalize(u.username || '').toLowerCase() === lower);
  if (user) return user;

  // 5) Fallback: try case-insensitive full name compare
  user = candidates.find(u => normalize(`${u.firstName} ${u.lastName}`).toLowerCase() === lower);
  if (user) return user;

  return null;
}

async function findManager(managerDisplayName) {
  // Prefer username exact, then firstName match
  const name = normalize(managerDisplayName);
  let manager = await User.findOne({ where: { username: name } });
  if (manager) return manager;
  manager = await User.findOne({ where: { firstName: name } });
  if (manager) return manager;
  // Fallback: full name compare
  const all = await User.findAll({ where: {} });
  const lower = name.toLowerCase();
  manager = all.find(u => normalize(`${u.firstName} ${u.lastName}`).toLowerCase() === lower);
  return manager || null;
}

async function run() {
  const mapping = {
    'Arif': [
      'ArfiyaN Agent','IbtishamN Agent','JanviN Agent','KajalN Agent','MaahiN Agent','NidhiN Agent','PriyaN Agent','SabaN Agent','SaimaN Agent','SaniyaN Agent','SimranN Agent','SnehaN Agent','SuhanaN Agent'
    ],
    'Faisal': [
      'Aamna Agent','Afroz Agent','Anam Ansari','BrindaPillai  Abranantham','Eram Shaikh','Farheen Agent','Hafrin Agent','Kashish  Parmar','KhushiW Agent','laiba Agent','Manisha  Agent','Manisha Agent','Mubasshira  Shah','Muskan Agent','Naheela Agent','neha Agent','Sandeep Agent','Sanika  Agent','Tanvi Agent','ZoyaW Agent'
    ],
    'Farhaan': [
      'Arshi Agent','Asif Agent','Athar Agent','Falak Agent','Hamza Agent','Mahek Agent','Mamta Agent','Mantasha Agent','Owais Agent','Rukhsar Agent','Saad Agent','Sumaiya Agent','Uzma1 Agent','ZoyaN Agent'
    ],
    'Umar': [
      'Alfiya Agent','Alia Agent','Ariba Agent','Heena Agent','Nashra Agent','Ruhi Agent','Saima Agent','Seema Agent','Shahina Agent','Shama Agent'
    ]
  };

  const results = { updated: 0, missingAgents: [], missingManagers: [] };

  for (const [managerName, agents] of Object.entries(mapping)) {
    const manager = await findManager(managerName);
    if (!manager) {
      console.warn(`Manager not found: ${managerName}`);
      results.missingManagers.push(managerName);
      continue;
    }

    for (const agentDisplay of agents) {
      const agent = await findUserByDisplay(agentDisplay);
      if (!agent) {
        console.warn(`Agent not found: ${agentDisplay}`);
        results.missingAgents.push(agentDisplay);
        continue;
      }
      if (agent.managerId === manager.id) {
        console.log(`Already assigned: ${agent.username || agent.firstName} -> ${manager.username || manager.firstName}`);
        continue;
      }
      agent.managerId = manager.id;
      await agent.save();
      results.updated += 1;
      console.log(`Assigned managerId: ${agent.username || agent.firstName} -> ${manager.username || manager.firstName}`);
    }
  }

  console.log('Summary:', results);
}

run()
  .then(() => {
    return sequelize.close();
  })
  .catch((err) => {
    console.error('Update failed:', err);
    return sequelize.close();
  });
