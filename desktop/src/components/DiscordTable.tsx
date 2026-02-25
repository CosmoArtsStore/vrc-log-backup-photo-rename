import React from 'react';

export interface DiscordTableColumn<T> {
  header: React.ReactNode;
  /** @deprecated CSS クラスベースの headerClassName を推奨 */
  headerStyle?: React.CSSProperties;
  headerClassName?: string;
  renderCell: (row: T, rowIndex: number) => React.ReactNode;
}

export interface DiscordTableProps<T> {
  columns: DiscordTableColumn<T>[];
  rows: T[];
  /** @deprecated CSS クラスベースの containerClassName を推奨 */
  containerStyle?: React.CSSProperties;
  containerClassName?: string;
  /** @deprecated CSS クラスベースの tableClassName を推奨 */
  tableStyle?: React.CSSProperties;
  tableClassName?: string;
  headerRowStyle?: React.CSSProperties;
  emptyRow?: React.ReactNode;
}

export function DiscordTable<T>({
  columns,
  rows,
  containerStyle,
  containerClassName,
  tableStyle,
  tableClassName,
  headerRowStyle,
  emptyRow,
}: DiscordTableProps<T>) {
  return (
    <div className={containerClassName} style={containerStyle}>
      <table className={tableClassName} style={tableStyle}>
        <thead>
          <tr style={headerRowStyle}>
            {columns.map((col, index) => (
              <th key={index} className={col.headerClassName} style={col.headerStyle}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyRow
            ? emptyRow
            : rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((col, colIndex) => (
                    <React.Fragment key={colIndex}>
                      {col.renderCell(row, rowIndex)}
                    </React.Fragment>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
