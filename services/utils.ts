
export const exportToCSV = (data: any[], fileName: string) => {
  if (!data || !data.length) return;
  
  const headers = Object.keys(data[0]);
  
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      const stringValue = value === null || value === undefined ? '' : String(value);
      return `"${stringValue.replace(/"/g, '""')}"`;
    }).join(','))
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${fileName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

export const parseCSV = async (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        let text = e.target?.result as string;
        if (!text) {
          resolve([]);
          return;
        }

        // Split into lines, handle both CRLF and LF
        const lines = text.split(/\r\n|\n/);
        if (lines.length === 0) {
          resolve([]);
          return;
        }

        const sep = (lines[0].includes(';') && !lines[0].includes(',')) ? ';' : ',';
        const parseLine = (line: string) => {
          const result = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (char === sep && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseLine(lines[0]);
        const result = [];
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = parseLine(line);
          if (values.length >= headers.length) {
            const obj: any = {};
            headers.forEach((header, index) => {
              if (header) {
                obj[header] = values[index];
              }
            });
            result.push(obj);
          }
        }
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, 'UTF-8');
  });
};
