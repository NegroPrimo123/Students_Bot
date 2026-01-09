
CREATE TABLE admins (
    created_at timestamp without time zone DEFAULT now(),
    telegram_id bigint NOT NULL,
    username character varying(255),
    id SERIAL PRIMARY KEY
);

CREATE TABLE events (
    archived_at timestamp without time zone,
    description text,
    created_by_admin boolean DEFAULT true,
    id SERIAL PRIMARY KEY,
    points_awarded integer DEFAULT 1,
    created_at timestamp without time zone DEFAULT now(),
    course integer,
    title character varying(500) NOT NULL,
    is_archived boolean DEFAULT false
);

CREATE TABLE participations (
    event_id integer NOT NULL,
    admin_comment text,
    student_id integer NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    certificate_file_id character varying(500),
    id SERIAL PRIMARY KEY
);

CREATE TABLE students (
    "group" character varying(50) NOT NULL,
    first_name character varying(255) NOT NULL,
    rating numeric(3,2) DEFAULT 3.0,
    course integer NOT NULL,
    username character varying(255),
    id SERIAL PRIMARY KEY,
    middle_name character varying(255),
    last_name character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    telegram_id bigint NOT NULL
);


ALTER TABLE admins 
ADD COLUMN email VARCHAR(255) UNIQUE,
ADD COLUMN password_hash VARCHAR(255),
ADD COLUMN full_name VARCHAR(255),
ADD COLUMN is_active BOOLEAN DEFAULT true,
ADD COLUMN last_login TIMESTAMP;

ALTER TABLE admins 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE admins 
ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

INSERT INTO admins (email, password_hash, full_name, telegram_id, username, is_active) 
VALUES (
    'asddd@college.edu',
    'admin123',
    'Администратор Системы',
    777,
    'admin_bot',
    true
);
