import { describe, expect, it } from 'vitest';
import { buildDatabaseConfigPayload } from './DatabaseConfigs';

describe('DatabaseConfigsPage payload collection', () => {
  it('omits an empty edit password so the backend keeps the stored secret', () => {
    const payload = buildDatabaseConfigPayload(
      {
        name: 'Production MySQL',
        db_type: 'mysql',
        host: '10.0.0.8',
        port: 3306,
        database: 'app',
        username: 'app_user',
        password: '',
      },
      { omitEmptyPassword: true },
    );

    expect(payload).toMatchObject({
      name: 'Production MySQL',
      db_type: 'mysql',
      host: '10.0.0.8',
      port: 3306,
      database: 'app',
      username: 'app_user',
    });
    expect(payload).not.toHaveProperty('password');
  });

  it('omits the masked edit password placeholder', () => {
    const payload = buildDatabaseConfigPayload(
      {
        name: 'Production MySQL',
        db_type: 'mysql',
        password: '....',
      },
      { omitEmptyPassword: true, passwordMask: '....' },
    );

    expect(payload).not.toHaveProperty('password');
  });

  it('omits the unchanged revealed edit password', () => {
    const payload = buildDatabaseConfigPayload(
      {
        name: 'Production MySQL',
        db_type: 'mysql',
        password: 'StoredSecret123!',
      },
      { omitEmptyPassword: true, unchangedPassword: 'StoredSecret123!' },
    );

    expect(payload).not.toHaveProperty('password');
  });

  it('keeps a non-empty edit password when the user enters a replacement', () => {
    const payload = buildDatabaseConfigPayload(
      {
        name: 'Production MySQL',
        db_type: 'mysql',
        host: '10.0.0.8',
        port: 3306,
        database: 'app',
        username: 'app_user',
        password: 'NewSecret123!',
      },
      { omitEmptyPassword: true },
    );

    expect(payload.password).toBe('NewSecret123!');
  });
});
