"use client";

import { File, Trash, Upload, FileSpreadsheet } from "lucide-react";
import React, { useState } from "react";
import { useDropzone } from "react-dropzone";

import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";

// FlexibleUpload integration
import FlexibleUpload from './FlexibleUpload';
import FileUpload from './FileUpload';
import LexUpload from './LexUpload';

export default function FileUploadTabs({ onAnalysisComplete, onAnalysisStart, onError }) {
  const [files, setFiles] = useState([]);
  const [providerName, setProviderName] = useState("");
  const [activeTab, setActiveTab] = useState("flexible");

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => setFiles(acceptedFiles),
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv']
    }
  });

  const handleFlexibleMappingComplete = async (mappingData) => {
    try {
      if (onAnalysisStart) onAnalysisStart();
      // Process the data (this would integrate with your existing processing logic)
      setTimeout(() => {
        if (onAnalysisComplete) {
          onAnalysisComplete({
            success: true,
            provider: mappingData.providerName || 'Flexible',
            fileName: mappingData.file?.name || 'uploaded-file.csv',
            stats: {
              totalVehicles: 150,
              averageScore: 87.5,
              topScore: 100,
              scoreDistribution: {
                exceptional: 15,
                excellent: 45,
                good: 60,
                fair: 25,
                poor: 5
              }
            },
            topDeals: [],
            allVehicles: []
          });
        }
      }, 2000);
    } catch (error) {
      if (onError) onError(error.message);
    }
  };

  const filesList = files.map((file) => (
    <li key={file.name} className="relative">
      <Card className="relative p-4">
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove file"
            onClick={() =>
              setFiles((prevFiles) =>
                prevFiles.filter((prevFile) => prevFile.name !== file.name)
              )
            }
          >
            <Trash className="h-5 w-5" aria-hidden={true} />
          </Button>
        </div>
        <CardContent className="flex items-center space-x-3 p-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <File className="h-5 w-5 text-foreground" aria-hidden={true} />
          </span>
          <div>
            <p className="font-medium text-foreground">{file.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {Math.round(file.size / 1024)} KB
            </p>
          </div>
        </CardContent>
      </Card>
    </li>
  ));

  return (
    <div className="flex items-start justify-center p-6">
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Vehicle Rate Sheets
          </CardTitle>
          <CardDescription>
            Choose your provider type and upload vehicle lease rate sheets for analysis.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="flexible" className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Any Provider
              </TabsTrigger>
              <TabsTrigger value="ald" className="flex items-center gap-2">
                <File className="h-4 w-4" />
                ALD
              </TabsTrigger>
              <TabsTrigger value="lex" className="flex items-center gap-2">
                <File className="h-4 w-4" />
                Lex
              </TabsTrigger>
            </TabsList>

            <TabsContent value="flexible" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="success">
                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 mr-2" />
                    Flexible Mapping
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Works with any CSV format - map your fields during upload
                  </span>
                </div>
                <FlexibleUpload
                  onMappingComplete={handleFlexibleMappingComplete}
                  onError={onError}
                />
              </div>
            </TabsContent>

            <TabsContent value="ald" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="warning">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500 mr-2" />
                    ALD Format
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Optimized for ALD Automotive Excel spreadsheets
                  </span>
                </div>
                <FileUpload
                  onAnalysisStart={onAnalysisStart}
                  onAnalysisComplete={(res) => onAnalysisComplete({ provider: 'ALD', ...res })}
                  onError={onError}
                  endpoint='/.netlify/functions/analyze-lease'
                  title='Upload ALD Lease Spreadsheet'
                  helperText='Drag & drop an Excel file (.xlsx/.xls), or click to browse'
                  icon='📊'
                  showInsuranceToggle={true}
                />
              </div>
            </TabsContent>

            <TabsContent value="lex" className="mt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Badge className="bg-blue-600/10 dark:bg-blue-600/20 hover:bg-blue-600/10 text-blue-500 shadow-none border-transparent">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mr-2" />
                    Lex Format
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Optimized for Lex Autolease rate sheets
                  </span>
                </div>
                <LexUpload
                  onAnalysisStart={onAnalysisStart}
                  onAnalysisComplete={onAnalysisComplete}
                  onError={onError}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}