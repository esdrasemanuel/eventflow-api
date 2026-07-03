SQL database:


CREATE TABLE events (
id SERIAL PRIMARY KEY,
account_name VARCHAR(255),
contract_number VARCHAR(100),
contact_name VARCHAR(255),
catering_manager VARCHAR(255),
booking_type VARCHAR(255),
booking_name TEXT,
email VARCHAR(255),
total_rooms INTEGER,
event_date VARCHAR(100),
operational_notes TEXT,
agreement_notes TEXT,
billing_instructions TEXT,
event_dietaries TEXT,
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE activities (
id SERIAL PRIMARY KEY,
event_id INTEGER NOT NULL,
start_time VARCHAR(20),
end_time VARCHAR(20),
time_range VARCHAR(50),
room VARCHAR(255),
function_name VARCHAR(255),
setup VARCHAR(255),
expected INTEGER,
guaranteed INTEGER,
rental VARCHAR(100),
notes TEXT,
created_at TIMESTAMP DEFAULT NOW(),
updated_at TIMESTAMP DEFAULT NOW(),
CONSTRAINT fk_event
FOREIGN KEY(event_id)
REFERENCES events(id)
ON DELETE CASCADE
);

CREATE TABLE activity_equipment (
id SERIAL PRIMARY KEY,
activity_id INTEGER NOT NULL,
equipment_name VARCHAR(255),
is_checked BOOLEAN DEFAULT FALSE,
checked_at TIMESTAMP,
CONSTRAINT fk_equipment_activity
FOREIGN KEY(activity_id)
REFERENCES activities(id)
ON DELETE CASCADE
);

CREATE TABLE food_services (
id SERIAL PRIMARY KEY,
activity_id INTEGER UNIQUE NOT NULL,
service_name TEXT,
service_price VARCHAR(100),
expected INTEGER,
CONSTRAINT fk_food_activity
FOREIGN KEY(activity_id)
REFERENCES activities(id)
ON DELETE CASCADE
);

CREATE TABLE food_items (
id SERIAL PRIMARY KEY,
food_service_id INTEGER NOT NULL,
item_name TEXT,
price VARCHAR(100),
expected INTEGER,
CONSTRAINT fk_food_item
FOREIGN KEY(food_service_id)
REFERENCES food_services(id)
ON DELETE CASCADE
);

CREATE TABLE beverage_services (
id SERIAL PRIMARY KEY,
activity_id INTEGER UNIQUE NOT NULL,
service_name TEXT,
price VARCHAR(100),
expected INTEGER,
bar_tab_limit NUMERIC(10,2),
notes TEXT,
CONSTRAINT fk_beverage_activity
FOREIGN KEY(activity_id)
REFERENCES activities(id)
ON DELETE CASCADE
);

CREATE INDEX idx_activities_event
ON activities(event_id);

-- ----IMPORTS


CREATE TABLE event_imports (
id SERIAL PRIMARY KEY,
event_id INTEGER NOT NULL,
import_hash VARCHAR(64),
imported_at TIMESTAMP DEFAULT NOW(),
source_file VARCHAR(255),
is_active BOOLEAN DEFAULT TRUE,
FOREIGN KEY(event_id)
REFERENCES events(id)
);

-- ALTER TABLE UPDATES

ALTER TABLE events
ADD COLUMN external_reference VARCHAR(255);

ALTER TABLE events
ADD COLUMN current_import_id INTEGER;

ALTER TABLE events
ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;

ALTER TABLE activities
ADD COLUMN import_id INTEGER;

ALTER TABLE activities
ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

ALTER TABLE activities
ADD COLUMN original_activity_key VARCHAR(255);

ALTER TABLE activities
ADD COLUMN version INTEGER DEFAULT 1;

ALTER TABLE activities
ADD COLUMN assigned_to INTEGER;

ALTER TABLE activities
ADD COLUMN completed BOOLEAN DEFAULT FALSE;

-- -----
----user
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(30) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

-- insert users for tests
INSERT INTO users (
    first_name,
    last_name,
    email,
    password_hash,
    phone,
    role
)
VALUES

(
    'Admin',
    'Admin',
    'admin@eventflow.com',
    '123456',
    '+353851111111',
    'ADMIN'
),

(
    'Vlad',
    'Johnson',
    'manager@eventflow.com',
    '123456',
    '+353852222222',
    'MANAGER'
),

(
    'Patrick',
    'Murphy',
    'supervisor@eventflow.com',
    '123456',
    '+353853333333',
    'SUPERVISOR'
),

(
    'Ezra',
    'Wilson',
    'waiter1@eventflow.com',
    '123456',
    '+353854444441',
    'WAITER'
);

-- hash password update for hash test
UPDATE users
SET password_hash = '$2b$10$21UE14KLxkRga2d5LeyR0OpFgigUz4birOKlAFN/BD91m0Ci93/ZG';




