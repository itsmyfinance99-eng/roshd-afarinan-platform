/**
 * @roshd/financial-report — the schedules of a calculation run as tables and as a report
 * document (comfar-model-spec §5). The result pages of the site read the tables; the xlsx, PDF
 * and HTML exports are written from the document, so that all of them show the same figures.
 * The browser imports the sub-paths it needs (`/tables`, `/frame`, …); `/fonts` is Node only.
 */
export * from './document';
export * from './frame';
export * from './html';
export * from './indicators';
export * from './inputs';
export * from './numbers';
export * from './report';
export * from './schedules';
export * from './tables';
export * from './warnings';
