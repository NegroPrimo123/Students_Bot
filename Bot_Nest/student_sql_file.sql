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
