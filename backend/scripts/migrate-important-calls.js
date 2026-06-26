require('dotenv').config();

const { sequelize } = require('../config/db');

async function main() {
  const transaction = await sequelize.transaction();
  try {
    const [previewRows] = await sequelize.query(
      `
        SELECT
          COUNT(*) AS totalCandidates,
          MIN(createdAt) AS minCreatedAt,
          MAX(createdAt) AS maxCreatedAt
        FROM dbo.Calls WITH (UPDLOCK, HOLDLOCK)
        WHERE LOWER(callType) IN ('follow-up upload', 'followup upload', 'followups upload')
          AND TRY_CONVERT(BIGINT, category) IS NOT NULL
      `,
      { transaction }
    );

    const totalCandidates = Number(previewRows?.[0]?.totalCandidates || 0);
    console.log(`Candidates to migrate: ${totalCandidates}`);
    if (totalCandidates) {
      console.log(`CreatedAt range: ${previewRows[0].minCreatedAt} -> ${previewRows[0].maxCreatedAt}`);
    }

    if (!totalCandidates) {
      await transaction.commit();
      console.log('No matching rows found. Nothing to migrate.');
      return;
    }

    const [result] = await sequelize.query(
      `
        UPDATE dbo.Calls
        SET
          callType = 'Important Upload',
          notes = CASE
            WHEN notes LIKE 'Imported via Follow-ups upload.%'
              THEN REPLACE(notes, 'Imported via Follow-ups upload.', 'Imported via Important Calls upload.')
            ELSE notes
          END,
          updatedAt = SYSUTCDATETIME()
        WHERE LOWER(callType) IN ('follow-up upload', 'followup upload', 'followups upload')
          AND TRY_CONVERT(BIGINT, category) IS NOT NULL
      `,
      { transaction }
    );

    await transaction.commit();
    console.log(`Migration completed. Rows updated: ${result?.rowsAffected?.[0] || 0}`);
  } catch (error) {
    await transaction.rollback();
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
