Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName System.Windows.Forms

# VRChat Photo Renamer GUI

$xamlMain = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="VRC Photo Renamer" Width="600" Height="285" Background="#f4f4f4"
        WindowStartupLocation="CenterScreen" ResizeMode="NoResize">
    <Grid Margin="20">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        <Grid.ColumnDefinitions>
            <ColumnDefinition Width="80"/>
            <ColumnDefinition Width="*"/>
            <ColumnDefinition Width="90"/>
        </Grid.ColumnDefinitions>

        <TextBlock Text="VRChat Photo Renamer GUI" FontSize="22" FontWeight="Bold" Grid.ColumnSpan="3" Margin="0,0,0,20" Foreground="#333"/>

        <TextBlock Text="Photo Dir:" Grid.Row="1" VerticalAlignment="Center" FontWeight="SemiBold"/>
        <TextBox Name="txtPhotoDir" Grid.Row="1" Grid.Column="1" Margin="10,5" Height="26" VerticalContentAlignment="Center"/>
        <Button Name="btnBrowsePhoto" Content="Browse..." Grid.Row="1" Grid.Column="2" Margin="0,5" Height="26"/>

        <TextBlock Text="Log Dir:" Grid.Row="2" VerticalAlignment="Center" FontWeight="SemiBold"/>
        <TextBox Name="txtLogDir" Grid.Row="2" Grid.Column="1" Margin="10,5" Height="26" VerticalContentAlignment="Center"/>
        <Button Name="btnBrowseLog" Content="Browse..." Grid.Row="2" Grid.Column="2" Margin="0,5" Height="26"/>

        <Button Name="btnScan" Content="Scan &amp; Preview" Grid.Row="4" Grid.ColumnSpan="3" Height="42" Margin="0,20,0,0" 
                Background="#007acc" Foreground="White" FontSize="14" FontWeight="Bold" BorderThickness="0" Cursor="Hand"/>
    </Grid>
</Window>
"@

$xamlModal = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Preview Rename" Width="900" Height="550" Background="#ffffff" 
        WindowStartupLocation="CenterScreen">
    <Grid Margin="20">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto"/>
            <RowDefinition Height="*"/>
            <RowDefinition Height="Auto"/>
        </Grid.RowDefinitions>
        
        <TextBlock Text="以下のファイルがリネーム可能です。変更しますか？" FontSize="18" FontWeight="Bold" Margin="0,0,0,10" Foreground="#222"/>
        
        <DataGrid Name="dgPreview" Grid.Row="1" AutoGenerateColumns="False" CanUserAddRows="False" IsReadOnly="True" 
                  AlternatingRowBackground="#f9f9f9" RowHeight="28" GridLinesVisibility="Horizontal" HeadersVisibility="Column"
                  BorderBrush="#ddd" BorderThickness="1">
            <DataGrid.Columns>
                <DataGridTextColumn Header="元のファイル名 (Original Name)" Binding="{Binding OldName}" Width="*"/>
                <DataGridTextColumn Header="変更後のファイル名 (New Name)" Binding="{Binding NewName}" Width="*"/>
            </DataGrid.Columns>
        </DataGrid>
        
        <StackPanel Grid.Row="2" Orientation="Horizontal" HorizontalAlignment="Right" Margin="0,15,0,0">
            <Button Name="btnCancel" Content="Cancel" Width="100" Height="34" Margin="0,0,10,0" Background="#e0e0e0" BorderThickness="0" Cursor="Hand"/>
            <Button Name="btnOk" Content="OK (Rename)" Width="140" Height="34" Background="#28a745" Foreground="White" FontSize="14" FontWeight="Bold" BorderThickness="0" Cursor="Hand"/>
        </StackPanel>
    </Grid>
</Window>
"@

function Load-Xaml ($xamlStr) {
    $reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]::new($xamlStr))
    return [System.Windows.Markup.XamlReader]::Load($reader)
}

$mainWin = Load-Xaml $xamlMain
$txtPhotoDir = $mainWin.FindName("txtPhotoDir")
$txtLogDir = $mainWin.FindName("txtLogDir")
$btnBrowsePhoto = $mainWin.FindName("btnBrowsePhoto")
$btnBrowseLog = $mainWin.FindName("btnBrowseLog")
$btnScan = $mainWin.FindName("btnScan")

# Set paths
$scriptPath = Join-Path $PSScriptRoot "rename_vrc_photos.ps1"
$defaultPhoto = [Environment]::GetFolderPath("MyPictures") + "\VRChat"
$defaultLog = [Environment]::GetFolderPath("ApplicationData") + "\..\LocalLow\VRChat\VRChat"

if (Test-Path "f:\DEVELOPFOLDER\RE-NAME-SYS\docs") {
    $defaultPhoto = "f:\DEVELOPFOLDER\RE-NAME-SYS\docs"
    $defaultLog = "f:\DEVELOPFOLDER\RE-NAME-SYS\docs"
}

$txtPhotoDir.Text = $defaultPhoto
$txtLogDir.Text = $defaultLog

$btnBrowsePhoto.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.SelectedPath = $txtPhotoDir.Text
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $txtPhotoDir.Text = $dlg.SelectedPath
    }
})

$btnBrowseLog.Add_Click({
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.SelectedPath = $txtLogDir.Text
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        $txtLogDir.Text = $dlg.SelectedPath
    }
})

$btnScan.Add_Click({
    $photoDir = $txtPhotoDir.Text
    $logDir = $txtLogDir.Text
    
    if (-not (Test-Path $photoDir) -or -not (Test-Path $logDir)) {
        [System.Windows.MessageBox]::Show("Please select valid folders.", "Error", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Error)
        return
    }

    $btnScan.Content = "Scanning..."
    $btnScan.IsEnabled = $false
    
    # Run DryRun to get previews
    $prevErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    $output = powershell.exe -ExecutionPolicy Bypass -File "$scriptPath" -PhotoDir "$photoDir" -LogDir "$logDir" -DryRun *>&1
    $ErrorActionPreference = $prevErrorActionPreference
    
    $previews = @()
    $currentOld = $null
    foreach ($line in $output) {
        $str = $line.ToString()
        if ($str -match '\[PREVIEW\]\s+(.+)$') {
            $currentOld = $Matches[1].Trim()
        }
        elseif ($currentOld -and $str -match '->\s+(.+)$') {
            $newN = $Matches[1].Trim()
            $previews += [PSCustomObject]@{ OldName = $currentOld; NewName = $newN }
            $currentOld = $null
        }
    }
    
    $btnScan.Content = "Scan & Preview"
    $btnScan.IsEnabled = $true

    if ($previews.Count -eq 0) {
        [System.Windows.MessageBox]::Show("リネーム可能なファイルが見つかりません。`n(対象がない、またはプレビュー抽出に失敗しました)", "Info", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
        return
    }

    $modalWin = Load-Xaml $xamlModal
    $dgPreview = $modalWin.FindName("dgPreview")
    $btnCancel = $modalWin.FindName("btnCancel")
    $btnOk = $modalWin.FindName("btnOk")

    $dgPreview.ItemsSource = $previews

    $btnCancel.Add_Click({
        $modalWin.DialogResult = $false
        $modalWin.Close()
    })

    $btnOk.Add_Click({
        $btnOk.Content = "Renaming..."
        $btnOk.IsEnabled = $false
        
        # Execute actual rename
        $execOut = powershell.exe -ExecutionPolicy Bypass -File "$scriptPath" -PhotoDir "$photoDir" -LogDir "$logDir" *>&1
        
        [System.Windows.MessageBox]::Show("リネームが完了しました！", "Success", [System.Windows.MessageBoxButton]::OK, [System.Windows.MessageBoxImage]::Information)
        $modalWin.DialogResult = $true
        $modalWin.Close()
    })

    $modalWin.ShowDialog() | Out-Null
})

$mainWin.ShowDialog() | Out-Null
