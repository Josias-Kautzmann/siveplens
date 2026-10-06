CREATE TABLE `alertas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uf` text(2) NOT NULL,
	`codigo_ibge` text(7),
	`semana_epi` integer NOT NULL,
	`ano_epi` integer NOT NULL,
	`tipo` text NOT NULL,
	`severidade` real NOT NULL,
	`explicacao` text,
	`criado_em` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `casos_srag` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uf` text(2) NOT NULL,
	`codigo_ibge` text(7) NOT NULL,
	`municipio` text,
	`semana_epi` integer NOT NULL,
	`ano_epi` integer NOT NULL,
	`casos_totais` integer DEFAULT 0 NOT NULL,
	`obitos` integer DEFAULT 0 NOT NULL,
	`internacoes` integer DEFAULT 0 NOT NULL,
	`data_atualizacao` text
);
--> statement-breakpoint
CREATE TABLE `fontes_noticias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`titulo` text NOT NULL,
	`url` text NOT NULL,
	`fonte` text,
	`uf` text(2),
	`data_publicacao` text,
	`score_correlacao` real,
	`alerta_id` integer,
	FOREIGN KEY (`alerta_id`) REFERENCES `alertas`(`id`) ON UPDATE no action ON DELETE no action
);
