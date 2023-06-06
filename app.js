const express = require('express');
const bodyParser = require('body-parser');
const { log } = require('console');

const app = express();

app.set('view engine', 'ejs'); // устанавливаем шаблонизатор ejs

app.use(bodyParser.urlencoded({ extended: false })); // подключаем парсер для данных из форм

// Маршрут для вывода главной страницы
app.get('/', (req, res) => {
    res.render('index');
});

// Маршрут для вывода страницы чтения файла
app.get('/readfile', (req, res) => {
    res.render('readfile');
});

app.post('/readfile', (req, res) => {
    const filePath = req.body.file;

    let sorter = new Sorter();

    sorter.sort(filePath).then(sortedFileName => {
        res.render('readfile', { sortedFileName });
    });
});

app.listen(3000, () => {
    console.log('Server started on port 3000 -_-');
});



class Sorter {

    constructor() {
        this.fs = require('fs');
    }


    async sort(filePath) {
        let fileFolderName = filePath.split('.')[0];
        this.createNewFolder(fileFolderName);

        let leftSegmentPath = fileFolderName + '/' + 'zero.txt';
        await this.createNewFile(leftSegmentPath, '');

        let sortedSegments = await this.devideFileIntoSortedSegments(filePath);

        let finalFileName = this.uniteFiles(fileFolderName, sortedSegments);

        return finalFileName;
    }

    async uniteFiles(fileFolderName, sortedSegments) {

        let rightSegment = false;
        let leftSegmentPath = fileFolderName + '/' + 'zero.txt';

        while (sortedSegments.length) {
            rightSegment = sortedSegments.pop();
            leftSegmentPath = await this.mergeSegments(fileFolderName, leftSegmentPath, rightSegment);
        }

        return leftSegmentPath;
    }




    writeIntoFile(filePath, text) {
        this.fs.appendFile(filePath, text, (err) => {
            if (err) throw err;
        });
    }

    takeLine(filePath, start, chunkSize) {
        return new Promise((resolve, reject) => {

            let line = '';

            const options = {
                start: start, // начать считывание с 101-го байта
                encoding: 'utf-8',
                highWaterMark: chunkSize
            };
            const stream = this.fs.createReadStream(filePath, options);

            stream.on('data', chunk => {
                const chunkLines = chunk.split('\n');

                line += chunkLines[0]
                if (chunkLines.length > 1) {
                    stream.close();
                    resolve(line);
                }
            });

            stream.on('end', () => {
                resolve(line);
            });


            stream.on('error', err => {
                console.error(err);
            });

        });

    }

    async mergeSegments(fileFolderName, leftSegment, integrableSegmentPath) {

        let chunkSize = 97; //настраиваем размер сегмента который можем отсортировать в озу

        let leftSegmentSize = await this.getFileSize(leftSegment);

        let finalFileLinePointer = 0;

        let rightSegmentSize = await this.getFileSize(integrableSegmentPath);

        let integrableSegmentLinePointer = 0;

        let winLine = false;

        let mergeResultFilePath = fileFolderName + '/' + leftSegmentSize + '_' + rightSegmentSize + '.txt';

        let result = await this.createNewFile(mergeResultFilePath, '');

        while (finalFileLinePointer < leftSegmentSize && integrableSegmentLinePointer < rightSegmentSize) {

            let finalFileLine = await this.takeLine(leftSegment, finalFileLinePointer, chunkSize);
            let integrableSegmentLine = await this.takeLine(integrableSegmentPath, integrableSegmentLinePointer, chunkSize);

            if (finalFileLine.length == 0) {
                break;
            }

            if (finalFileLine.length < integrableSegmentLine.length) {
                winLine = finalFileLine;
                finalFileLinePointer += Buffer.byteLength(finalFileLine, 'utf8') + 1;//+1 это \n
            }
            else {
                winLine = integrableSegmentLine;
                integrableSegmentLinePointer += Buffer.byteLength(integrableSegmentLine, 'utf8') + 1;
            }
            if (winLine) {

                this.writeIntoFile(mergeResultFilePath, winLine + '\n');
            }
        }

        while (finalFileLinePointer < leftSegmentSize) {
            let finalFileLine = await this.takeLine(leftSegment, finalFileLinePointer, chunkSize);
            if (finalFileLine.length == 0) {
                break;
            }
            finalFileLinePointer += Buffer.byteLength(finalFileLine, 'utf8') + 1;//+1 это \n
            this.writeIntoFile(mergeResultFilePath, finalFileLine + '\n');
        }

        while (integrableSegmentLinePointer < rightSegmentSize) {
            let integrableSegmentLine = await this.takeLine(integrableSegmentPath, integrableSegmentLinePointer, chunkSize);
            if (integrableSegmentLine.length == 0) {
                break;
            }
            integrableSegmentLinePointer += Buffer.byteLength(integrableSegmentLine, 'utf8') + 1;
            this.writeIntoFile(mergeResultFilePath, integrableSegmentLine + '\n');
        }

        return mergeResultFilePath;
    }


    async devideFileIntoSortedSegments(filePath) {
        let result = await new Promise((resolve, reject) => {

            let sortedFileSegments = [];

            let segmentSize = 1 * 1024; //настраиваем размер сегмена который можем отсортировать в озу

            const options = {
                start: 0, // начать считывание с 101-го байта
                encoding: 'utf-8',
                highWaterMark: segmentSize
            };

            const stream = this.fs.createReadStream(filePath, options);



            let lostLine = false;

            stream.on('data', chunk => {
                const chunkLines = chunk.split('\n');

                let fullStringsCount = (chunk.match(new RegExp('\n', 'g')) || []).length;

                let readedLinesCount = chunkLines.length;

                if (lostLine) {
                    chunkLines.unshift(lostLine);
                }

                if (readedLinesCount !== fullStringsCount) {
                    //незаконченная последняя строчка замеряем сколько весит защеканка и отправляем в след сегмент
                    lostLine = chunkLines.pop();
                }

                let sortedChunkLines = this.mergeSort(chunkLines);

                let firstLineNumCost = this.stringToNumericalCost(sortedChunkLines[0]);
                let lastLineNumCost = this.stringToNumericalCost(sortedChunkLines.slice(-1));
                let newFilePath = filePath.split('.')[0] + '/' + firstLineNumCost + '_' + lastLineNumCost + '.txt';

                this.createNewFile(newFilePath, sortedChunkLines.join('\n'));

                sortedFileSegments.push(newFilePath)

            });

            stream.on('end', () => {
                resolve(sortedFileSegments);
            });


            stream.on('error', err => {
                console.error(err);
            });


        });
        return result;
    }




    stringToNumericalCost(string) {
        let charCount = string.toString().split('').length;
        return +charCount;
    }

    mergeSort(arr) {
        // Проверяем корректность переданных данных
        if (!arr || !arr.length) {
            return null;
        }
        //Если массив содержит один элемент просто возвращаем его
        if (arr.length <= 1) {
            return arr;
        }
        // Находим середину массива и делим его на два
        const middle = Math.floor(arr.length / 2);
        const arrLeft = arr.slice(0, middle);
        const arrRight = arr.slice(middle);
        // Для новых массивов снова вызываем сортировку,
        // сливаем их и возвращаем снова единый массив

        return this.merge(this.mergeSort(arrLeft), this.mergeSort(arrRight));
    }

    merge(arrFirst, arrSecond) {
        const arrSort = [];
        let i = 0;
        let j = 0;
        // сравниваем два массива, поочередно сдвигая указатели

        while (i < arrFirst.length && j < arrSecond.length) {

            let firstStringNumericalCost = this.stringToNumericalCost(arrFirst[i]);
            let secondStringNumericalCost = this.stringToNumericalCost(arrSecond[j]);
            arrSort.push(
                (firstStringNumericalCost < secondStringNumericalCost) ? arrFirst[i++] : arrSecond[j++]
            );
        }
        // обрабатываем последний элемент при разной длине массивов
        // и возвращаем один отсортированный массив

        return [
            ...arrSort,
            ...arrFirst.slice(i),
            ...arrSecond.slice(j)
        ];
    }

    createNewFolder(folderName) {
        this.fs.mkdir(folderName, err => {
            if (err) {
                return false
            }
        });
    }

    createNewFile(newFilePath, text) {
        return new Promise((resolve, reject) => {
            const writeStream = this.fs.createWriteStream(newFilePath, { encoding: 'utf8' });

            let result = writeStream.write(text);

            writeStream.end();

            resolve(result);
        });
    }

    getFileSize(filePath) {
        return new Promise((resolve, reject) => {
            this.fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(err);
                    return;
                }

                const fileSize = stats.size;
                resolve(fileSize);
            });
        });
    }
}