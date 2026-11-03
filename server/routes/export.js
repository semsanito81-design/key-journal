import ExcelJS from 'exceljs';
import { authHook } from '../auth.js';
import { q } from '../db.js';

export default async function(app){
  app.addHook('preHandler', authHook);

  // Экспорт сертификатов в Excel
  app.get('/excel', async (req, reply) => {
    try {
      // 1. Получаем данные из VIEW (там уже посчитаны сроки)
      const { rows } = await q(`
        SELECT 
          cr.ppp, cr.employee, cr.position, cr.department, 
          cr.carrier_type, cr.carrier_serial, cr.issue_date,
          c.serial_number, c.valid_from, c.valid_to, c.status,
          t.name as type_name
        FROM v_certificates c
        JOIN carriers cr ON cr.id = c.carrier_id
        JOIN cert_types t ON t.code = c.cert_type
        ORDER BY cr.employee, c.cert_type
      `);

      // 2. Создаем книгу и лист
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Сертификаты');

      // 3. Настраиваем колонки
      worksheet.columns = [
        { header: '№', key: 'ppp', width: 5 },
        { header: 'ФИО сотрудника', key: 'employee', width: 35 },
        { header: 'Должность', key: 'position', width: 30 },
        { header: 'Подразделение', key: 'department', width: 30 },
        { header: 'Тип носителя', key: 'carrier_type', width: 20 },
        { header: 'Серийный № носителя', key: 'carrier_serial', width: 20 },
        { header: 'Тип сертификата', key: 'type_name', width: 15 },
        { header: 'Серийный № серт.', key: 'serial_number', width: 20 },
        { header: 'Дата выдачи', key: 'issue_date', width: 15, style: { numFmt: 'dd.mm.yyyy' } },
        { header: 'Действует до', key: 'valid_to', width: 15, style: { numFmt: 'dd.mm.yyyy' } },
        { header: 'Статус', key: 'status', width: 15 }
      ];

      // 4. Стилизуем шапку (жирный шрифт, серый фон)
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' } // Синий цвет как в интерфейсе
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

      // 5. Добавляем данные и раскрашиваем строки
      rows.forEach(row => {
        // Превращаем строки базы в объект
        const data = {
          ppp: row.ppp,
          employee: row.employee,
          position: row.position,
          department: row.department,
          carrier_type: row.carrier_type,
          carrier_serial: row.carrier_serial,
          type_name: row.type_name,
          serial_number: row.serial_number,
          issue_date: row.issue_date ? new Date(row.issue_date) : null,
          valid_to: row.valid_to ? new Date(row.valid_to) : null,
          status: row.status === 'active' ? 'Активен' : (row.status === 'revoked' ? 'Отозван' : 'Истёк')
        };

        const excelRow = worksheet.addRow(data);

        // Красим просроченные (если дата окончания меньше сегодняшней)
        if (data.valid_to && data.valid_to < new Date()) {
          excelRow.eachCell((cell) => {
            cell.font = { color: { argb: 'FFDC2626' } }; // Красный текст
          });
        } 
        // Красим те, что истекают в ближайшие 60 дней
        else if (data.valid_to) {
          const daysLeft = Math.ceil((data.valid_to - new Date()) / 86400000);
          if (daysLeft <= 60) {
            excelRow.eachCell((cell) => {
              cell.font = { color: { argb: 'FFD97706' } }; // Оранжевый текст
            });
          }
        }
      });

      // 6. Включаем автофильтр по шапке
      worksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 11 }
      };

      // 7. Генерируем файл и отправляем
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', 'attachment; filename="journal_report.xlsx"');
      
      const buffer = await workbook.xlsx.writeBuffer();
      return reply.send(buffer);

    } catch (err) {
      app.log.error(err);
      return reply.code(500).send({ error: 'Ошибка при генерации Excel' });
    }
  });
}