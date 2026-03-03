# Point System Implementation TODO

## Phase 1: Config Model Updates
- [ ] 1.1 Update src/database/models/Config.js - Add pointsEnabled and pointsOnClose fields
- [ ] 1.2 Update src/database/database.js - Add migration for new columns

## Phase 2: Update Ticket Commands
- [ ] 2.1 Update src/commands/ticket/ticket.js - Remove points from reopen, use configurable values
- [ ] 2.2 Update src/systems/ticket/ticketButtons.js - Remove points from reopen, use configurable values

## Phase 3: Update Setup Command
- [ ] 3.1 Update src/commands/admin/setup.js - Add /setup points subcommand
