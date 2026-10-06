import { questionnaireDefinitionSchema, questionsOf } from '@roshd/validation';
import { describe, expect, it } from 'vitest';
import { DEMO_QUESTIONNAIRE_DEFINITION } from '../../../../prisma/demo-questionnaire';

describe('the sample questionnaire of the demo seed', () => {
  it('is a definition the engine accepts and could publish', () => {
    const parsed = questionnaireDefinitionSchema.safeParse(DEMO_QUESTIONNAIRE_DEFINITION);
    expect(parsed.error?.issues ?? []).toEqual([]);
    expect(questionsOf(DEMO_QUESTIONNAIRE_DEFINITION).length).toBeGreaterThan(0);
  });
});
